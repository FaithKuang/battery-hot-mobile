// Portable public read model for GitHub Pages. Never serialize database rows or article bodies.
import { createHash } from "node:crypto";
import { AIDC_COMPANIES } from "@aihot/industry/aidc";
import { addDays, beijingDate, beijingMidnight } from "@aihot/contracts/time";
import { normalizeUrl, isBlockedAddress } from "../lib/url.ts";
import { shouldMergeEvents } from "../battery/merge-rules.ts";
import { mergeIdentity } from "../battery/group.ts";
import { allowsBatteryTopic, type BatteryTopic } from "../battery/free-publication.ts";
import type { AidcResponse } from "@aihot/contracts/site";
import { classifyBatteryTopic } from "../battery/topic.ts";
import { classifyAidcPublication } from "../battery/topic.ts";

export interface PagesItem {
  id: string;
  sourceId: string;
  title: string;
  originalTitle: string | null;
  sourceTitle: string;
  publishedAt: string;
  category: string | null;
  topic: BatteryTopic;
  kind: "headline-only" | "extract-only" | "summarized" | "selected";
  summary: string | null;
  score: number | null;
  facts: Array<{ text: string; quote: string; url: string }>;
  aidcPriority: 0 | 1 | 2;
  companies: string[];
  sources: Array<{ name: string; url: string }>;
}
export interface PagesSnapshot {
  version: 1;
  generatedAt: string;
  check: { at: string; state: "snapshot" | "complete" | "partial"; sources: number; failedSources: string[] };
  items: PagesItem[];
  community: AidcResponse["community"];
  sources: AidcResponse["sources"];
  reports: Array<{ date: string; windowStart: string; windowEnd: string; itemIds: string[]; generatedAt: string }>;
}

export function publicUrl(value: string): string | null {
  try {
    const u = new URL(value);
    if (!/^https?:$/.test(u.protocol) || u.username || u.password || u.hostname === "localhost"
      || !u.hostname.includes(".") || /(^|\.)local$/i.test(u.hostname)
      || /^news\.google\./i.test(u.hostname) || /(^|\.)google\.com$/i.test(u.hostname)
      || /^\[|^\d+\.\d+\.\d+\.\d+$/.test(u.hostname) && isBlockedAddress(u.hostname.replace(/^\[|\]$/g, ""))) return null;
    if ([...u.searchParams.keys()].some(k => /^(?:token|api_?key|access_token|password|secret|signature)$/i.test(k))) return null;
    return normalizeUrl(value);
  } catch { return null; }
}

/** Explicit allowlist and headline field isolation, also when loading a previous public snapshot. */
export function publicItem(input: PagesItem, curatedIds: Set<string>, now: Date): PagesItem | null {
  if (!curatedIds.has(input.sourceId) || !allowsBatteryTopic(input.sourceId, input.topic)
    || !input.sourceTitle?.trim() || !input.title?.trim() || input.title.length > 1000
    || !Number.isFinite(Date.parse(input.publishedAt)) || Date.parse(input.publishedAt) > now.getTime()) return null;
  // Recheck the visible article lead, not a whole page's related links or generic "cells".
  const lead = `${input.sourceTitle} ${(input.summary ?? "").slice(0, 300)}`;
  const topic = classifyBatteryTopic(input.sourceId, input.sourceTitle, (input.summary ?? "").slice(0, 300));
  if (!allowsBatteryTopic(input.sourceId, topic)) return null;
  if (!["nvidia-news", "nvidia-blog", "nvidia-developer", "nvidia-research"].includes(input.sourceId)) {
    const battery = /lithium|\bli.ion\b|\bbbu\b|\bups\b|batter(?:y|ies)|anode|cathode|electrolyte|solid.state|dry.coat|电池|電池|锂|鋰|电芯|電芯|正极|负极|电解液|固态|干法|배터리|리튬|リチウム/iu.test(lead);
    const aidc = /data[\s-]?cent(?:er|re)s?|AI factor(?:y|ies)|\baidc\b|数据中心|資料中心|智算|データセンター/iu.test(lead)
      && /power|\bups\b|\bbbu\b|\bhvdc\b|\bvdc\b|cooling|rack|network|interconnect|server|GPU|供电|供電|电源|電源|液冷|散热|散熱|机柜|機櫃|伺服器|服务器/iu.test(lead);
    const poweredApplication = topic === "battery-application" && /charg|electric range|battery.electric|续航|充电|充電|供电|供電/iu.test(lead);
    if (!battery && !aidc && !poweredApplication) return null;
    if (/ukraine|russia|airstrike|missile strike|乌克兰|俄羅斯|俄罗斯|战况/iu.test(input.sourceTitle)
      && !battery && !/\bbbu\b|\bups\b|backup power|备电|備電/iu.test(lead)) return null;
  }
  const sources = input.sources.map(s => ({ name: String(s.name).slice(0, 120), url: publicUrl(s.url) }))
    .filter((s): s is { name: string; url: string } => !!s.url && !!s.name);
  if (!sources.length) return null;
  if (/(?:^|\/)(?:sponsored|advertorial)(?:-|\/|$)/i.test(new URL(sources[0]!.url).pathname)) return null;
  // Research RSS also lists staff profile updates. They are not reports or news articles.
  if (input.sourceId === "nvidia-research" && /^\/(?:person|people|taxonomy|user)(?:\/|$)/.test(new URL(sources[0]!.url).pathname)) return null;
  let kind = input.kind;
  if (!["headline-only", "extract-only", "summarized", "selected"].includes(kind)) kind = "headline-only";
  const facts = (input.facts ?? []).filter(f => publicUrl(f.url) && f.quote?.length >= 12)
    .slice(0, 8).map(f => ({ text: f.text.slice(0, 400), quote: f.quote.slice(0, 400), url: publicUrl(f.url)! }));
  if ((kind === "selected" || kind === "summarized") && (!/[\u3400-\u9fff]/u.test(input.title)
    || !/[a-z]/i.test(input.originalTitle ?? "") || !/[\u3400-\u9fff]/u.test(input.summary ?? ""))) kind = "headline-only";
  if (kind === "selected" && (!facts.length || !Number.isFinite(input.score))) kind = "summarized";
  if (kind === "extract-only" && !input.summary?.startsWith("原文摘录：")) kind = "headline-only";
  const headline = kind === "headline-only";
  const aidc = classifyAidcPublication(input.sourceId, input.sourceTitle, headline ? "" : (input.summary ?? "").slice(0, 300));
  return {
    id: createHash("sha256").update(sources[0]!.url).digest("hex").slice(0, 24), sourceId: input.sourceId,
    title: headline ? input.sourceTitle.slice(0, 1000) : input.title.slice(0, 1000),
    originalTitle: headline ? null : input.originalTitle?.slice(0, 1000) ?? null,
    sourceTitle: input.sourceTitle.slice(0, 1000), publishedAt: new Date(input.publishedAt).toISOString(),
    category: input.category, topic: input.topic, kind,
    summary: headline ? null : input.summary?.slice(0, 1200) ?? null,
    score: kind === "selected" ? input.score : null, facts: kind === "selected" ? facts : [],
    aidcPriority: aidc.priority,
    companies: AIDC_COMPANIES.filter(c => aidc.companies.includes(c.id)).map(c => c.id), sources,
  };
}

export function mergePagesItems(previous: PagesItem[], fresh: PagesItem[], curatedIds: Set<string>, now = new Date()): PagesItem[] {
  // URL revisions replace old content. A fresh title-only observation does not discard a previously
  // verified summary of the same title/date; it remains a saved summary, not a new model result.
  const byUrl = new Map<string, PagesItem>();
  const rank = { "headline-only": 0, "extract-only": 1, summarized: 2, selected: 3 };
  for (const raw of [...previous, ...fresh]) {
    const item = publicItem(raw, curatedIds, now);
    if (!item) continue;
    const key = item.sources[0]!.url;
    const old = byUrl.get(key);
    byUrl.set(key, old && old.sourceTitle === item.sourceTitle && old.publishedAt === item.publishedAt
      && rank[old.kind] > rank[item.kind] ? old : item);
  }
  const groups: PagesItem[] = [];
  for (const item of [...byUrl.values()].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id))) {
    const identity = mergeIdentity(item.sourceTitle, item.topic);
    const match = groups.find(other => {
      if (Math.abs(Date.parse(other.publishedAt) - Date.parse(item.publishedAt)) > 72 * 3600000) return false;
      const theirs = mergeIdentity(other.sourceTitle, other.topic);
      return shouldMergeEvents(item.sourceTitle, other.sourceTitle, identity.signature, theirs.signature, identity.organizations, theirs.organizations);
    });
    if (!match) { groups.push(item); continue; }
    const sources = [...new Map([...match.sources, ...item.sources].map(s => [s.url, s])).values()];
    const publishedAt = match.publishedAt;
    const companies = [...new Set([...match.companies, ...item.companies])];
    const priority = Math.max(match.aidcPriority, item.aidcPriority) as 0 | 1 | 2;
    if (rank[item.kind] > rank[match.kind]) Object.assign(match, item);
    Object.assign(match, { sources, publishedAt, companies, aidcPriority: priority });
  }
  if (groups.length > 10000) throw new Error("Public snapshot exceeds reviewed capacity; refusing silent history truncation");
  return groups.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id));
}

export function pagesReport(items: PagesItem[], now = new Date()) {
  const date = beijingDate(now.getTime());
  const start = beijingMidnight(addDays(date, -1)).toISOString();
  const end = beijingMidnight(date).toISOString();
  return { date, windowStart: start, windowEnd: end,
    itemIds: items.filter(i => i.kind === "selected" && i.publishedAt >= start && i.publishedAt < end).map(i => i.id),
    generatedAt: now.toISOString() };
}

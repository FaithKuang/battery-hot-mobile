import * as cheerio from "cheerio";
import { createHash } from "node:crypto";
import { BBU_ACCOUNT } from "@aihot/industry/bbu-account";
import { AIDC_COMPANIES } from "@aihot/industry/aidc";
import { beijingDate } from "@aihot/contracts/time";
import { sql } from "../db.ts";
import { guardedFetch } from "../lib/http-fetch.ts";
import { collapseWhitespace } from "../lib/text.ts";

type Topic = "bbu" | "cbu" | "backup-power";
interface AccountPost {
  id: string; url: string; title: string; excerpt: string; companies: string[]; topic: Topic; hash: string;
}
export interface AccountCheck {
  state: "ok" | "partial" | "error";
  scanned: number; relevant: number; created: number; updated: number; rejected: number; failed: number;
}
const TECH = /\bBBU\b|\bCBU\b|battery[\s-]*back.?up|Capacitor Back.?up|電池備援|电池备援|備援(?:電源|供電)|备援(?:电源|供电)|\bHVDC\b|\b[0-9]+\s?kW\b/iu;

/** Only the account's own post body: no comments, recommendations or omitted-year guesses. */
export function parseAccountPosts(html: string): { scanned: number; posts: AccountPost[] } {
  const $ = cheerio.load(html);
  const own = $("article[id^='art']").toArray().filter(node =>
    $(node).find(".articleContent__member a.normal__avatar-link").first().attr("href") === `/forum/user/${BBU_ACCOUNT.id}`);
  if (!own.length) throw new Error("Account posts unavailable or page layout changed");
  const posts: AccountPost[] = [];
  for (const node of own.slice(0, 10)) {
    const card = $(node);
    const id = card.attr("id")!.slice(3);
    if (!/^\d+$/.test(id) || posts.some(p => p.id === id)) continue;
    const lines = card.find(".articleContent__text .textRule__line").toArray().map(e => collapseWhitespace($(e).text())).filter(Boolean);
    const text = lines.join("\n");
    const tags = card.find(".articleContent__tags a[title]").map((i, e) => $(e).attr("title")).get().join(" ");
    const companies = AIDC_COMPANIES.filter(c => c.pattern.test(`${tags} ${text}`)).map(c => c.id);
    if (!companies.length || !TECH.test(text)) continue;
    if (!/\bBBU\b|\bCBU\b|battery[\s-]*back.?up|Capacitor Back.?up|電池備援|电池备援|備援(?:電源|供電)|备援(?:电源|供电)|\bHVDC\b/iu.test(text)
      && !/\bCSP\b|\bAWS\b|\bMeta\b|data cent(?:er|re)|資料中心|数据中心|數據中心/iu.test(text)) continue;
    const technical = lines.find(l => TECH.test(l) && !/目標價|目标价|買進|买进|賣出|卖出|漲停|涨停|股價|股价/.test(l));
    if (!technical) continue;
    const topic: Topic = /\bBBU\b|battery[\s-]*back.?up|電池備援|电池备援/iu.test(text) ? "bbu"
      : /\bCBU\b|Capacitor Back.?up/iu.test(text) ? "cbu" : "backup-power";
    const title = collapseWhitespace(card.find("h3").first().text() || lines[0] || "备援供电讨论").slice(0, 160);
    posts.push({ id, url: `https://www.cmoney.tw/forum/article/${id}`, title,
      excerpt: technical.slice(0, 180), companies, topic,
      hash: createHash("sha256").update(`${title}\n${tags}\n${text}`).digest("hex") });
  }
  return { scanned: Math.min(own.length, 10), posts };
}

/** Bind the publication time to this exact post AND author, not a related article on the page. */
export function accountPostDate(html: string, post: Pick<AccountPost, "url">, now: Date): Date | null {
  const $ = cheerio.load(html);
  for (const script of $("script[type='application/ld+json']").toArray()) {
    let data: unknown;
    try { data = JSON.parse($(script).text()); } catch { continue; }
    const items: any[] = Array.isArray(data) ? data : (data as any)?.["@graph"] ?? [data];
    for (const item of items) {
      if (!item || !["NewsArticle", "DiscussionForumPosting"].includes(item["@type"]) || item.url !== post.url) continue;
      if ((item.author?.url ?? item.author?.["@id"]) !== BBU_ACCOUNT.url) continue;
      const value = item.datePublished;
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) continue;
      const calendar = new Date(`${value.slice(0, 10)}T00:00:00Z`);
      if (!Number.isFinite(+calendar) || calendar.toISOString().slice(0, 10) !== value.slice(0, 10)) continue;
      const date = new Date(value);
      if (Number.isFinite(+date) && +date <= +now) return date;
    }
  }
  return null;
}

async function readPublicPage(url: string) {
  const res = await guardedFetch(url, { timeoutMs: 12_000, maxBytes: 2 * 1024 * 1024 });
  if (res.status !== 200) throw new Error("Public account page unavailable");
  if (!res.url.startsWith("https://www.cmoney.tw/forum/")) throw new Error("Unexpected account redirect");
  return res.text();
}

/** At most the profile plus ten changed relevant posts, free, once per daily batch. */
export async function collectBbuAccount(now = new Date(), force = false, read = readPublicPage): Promise<AccountCheck> {
  const day = beijingDate(+now);
  const [prior] = await sql<{ day_key: string; result: AccountCheck }[]>`SELECT day_key::text,result FROM battery_account_checks WHERE account_id=${BBU_ACCOUNT.id}`;
  if (!force && prior?.day_key === day) return { ...prior.result, created: 0, updated: 0 };
  const result: AccountCheck = { state: "ok", scanned: 0, relevant: 0, created: 0, updated: 0, rejected: 0, failed: 0 };
  try {
    const parsed = parseAccountPosts(await read(BBU_ACCOUNT.url));
    result.scanned = parsed.scanned;
    result.relevant = parsed.posts.length;
    for (const post of parsed.posts) {
      const [existing] = await sql<{ content_hash: string }[]>`SELECT content_hash FROM battery_account_signals
        WHERE account_id=${BBU_ACCOUNT.id} AND post_id=${post.id}`;
      if (existing?.content_hash === post.hash) continue;
      try {
        const date = accountPostDate(await read(post.url), post, now);
        if (!date) { result.rejected++; continue; }
        const [stored] = await sql<{ inserted: boolean }[]>`INSERT INTO battery_account_signals
          (account_id,post_id,url,title,excerpt,companies,topic,published_at,checked_at,content_hash)
          VALUES(${BBU_ACCOUNT.id},${post.id},${post.url},${post.title},${post.excerpt},${post.companies},${post.topic},${date},${now},${post.hash})
          ON CONFLICT(account_id,post_id) DO UPDATE SET title=EXCLUDED.title,excerpt=EXCLUDED.excerpt,
            companies=EXCLUDED.companies,topic=EXCLUDED.topic,checked_at=EXCLUDED.checked_at,content_hash=EXCLUDED.content_hash
          WHERE battery_account_signals.content_hash <> EXCLUDED.content_hash
          RETURNING (xmax = 0) AS inserted`;
        if (stored) { if (stored.inserted) result.created++; else result.updated++; }
      } catch { result.failed++; }
    }
    if (result.failed || result.rejected) result.state = "partial";
  } catch { result.state = "error"; result.failed++; }
  await sql`INSERT INTO battery_account_checks(account_id,day_key,checked_at,last_ok_at,result)
    VALUES(${BBU_ACCOUNT.id},${day}::date,${now},${result.state === "ok" ? now : null},${sql.json(result as never)})
    ON CONFLICT(account_id) DO UPDATE SET day_key=EXCLUDED.day_key,checked_at=EXCLUDED.checked_at,
      last_ok_at=coalesce(EXCLUDED.last_ok_at,battery_account_checks.last_ok_at),result=EXCLUDED.result`;
  return result;
}

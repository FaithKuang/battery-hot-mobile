import { AIDC_COMPANIES } from "@aihot/industry/aidc";
import { BBU_ACCOUNT } from "@aihot/industry/bbu-account";
import type { AidcResponse } from "@aihot/contracts/site";
import { sql } from "../db.ts";
import { ITEM_COLUMNS, ITEM_FROM, listedCondition, toFeedItemSummary, type ItemRow } from "./items.ts";

const PAGE_SIZE = 20;

/** Same visibility, deduplication and headline projection as every other public surface. */
export async function loadAidc(company: string | null, bbuPage = 1, page = 1, now = new Date(), technicalPage = 1): Promise<AidcResponse> {
  const companyCondition = company ? sql`AND p.aidc_companies @> ${[company]}::text[]` : sql``;
  const section = async (priority: number, requested: number) => {
    const [{ count }] = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM publications p WHERE ${listedCondition(now)} AND p.eligible
        AND p.published_at IS NOT NULL AND p.published_at <= ${now} AND p.aidc_priority = ${priority} ${companyCondition}`;
    const pageCount = Math.max(1, Math.ceil(count! / PAGE_SIZE));
    const current = Math.min(Math.max(1, Math.floor(requested)), pageCount);
    const rows = await sql<ItemRow[]>`
      SELECT ${ITEM_COLUMNS} ${ITEM_FROM} WHERE ${listedCondition(now)} AND p.eligible
        AND p.published_at IS NOT NULL AND p.published_at <= ${now} AND p.aidc_priority = ${priority} ${companyCondition}
      ORDER BY p.published_at DESC, p.article_id DESC LIMIT ${PAGE_SIZE} OFFSET ${(current - 1) * PAGE_SIZE}`;
    return { items: rows.map(toFeedItemSummary), total: count!, page: current, pageCount };
  };
  const ids = AIDC_COMPANIES.flatMap(c => c.sources);
  const [bbu, technical, latest, sources, signals, checks] = await Promise.all([
    section(2, bbuPage), section(3, technicalPage), section(1, page),
    sql<{ id: string; name: string; config: Record<string, string>; enabled: boolean; last_ok_at: Date | null; last_error: string | null }[]>`
      SELECT id, name, config, enabled, last_ok_at, last_error FROM sources WHERE id IN ${sql(ids)} ORDER BY id`,
    sql<{ post_id: string; url: string; title: string; excerpt: string; companies: string[]; topic: "bbu" | "cbu" | "backup-power"; published_at: Date }[]>`
      SELECT post_id,url,title,excerpt,companies,topic,published_at FROM battery_account_signals
      WHERE account_id=${BBU_ACCOUNT.id} AND published_at <= ${now}
        ${company ? sql`AND companies @> ${[company]}::text[]` : sql``}
      ORDER BY published_at DESC,post_id DESC LIMIT 20`,
    sql<{ checked_at: Date; result: { state: "ok" | "partial" | "error" } }[]>`
      SELECT checked_at,result FROM battery_account_checks WHERE account_id=${BBU_ACCOUNT.id}`,
  ]);
  return { company, bbu, technical, latest, community: {
    account: { name: BBU_ACCOUNT.name, url: BBU_ACCOUNT.url, checkedAt: checks[0]?.checked_at.toISOString() ?? null,
      state: checks[0]?.result.state ?? "pending" },
    items: signals.map(s => ({ id: s.post_id, url: s.url, title: s.title, excerpt: s.excerpt, companies: s.companies,
      topic: s.topic, publishedAt: s.published_at.toISOString() })),
  }, sources: sources.map(s => ({
    id: s.id, name: s.name, company: AIDC_COMPANIES.find(c => (c.sources as readonly string[]).includes(s.id))!.id,
    url: s.config.feedUrl ?? s.config.url ?? "", enabled: s.enabled, lastOkAt: s.last_ok_at?.toISOString() ?? null,
    state: !s.enabled ? "paused" : s.last_error ? "error" : s.last_ok_at ? "ok" : "pending",
  })) };
}

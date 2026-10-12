import { beijingDate } from "@aihot/contracts/time";
import { sql } from "../db.ts";
import { collectSource } from "../sources/collect.ts";
import { extractArticleBody } from "../content/extract.ts";
import { composeDaily } from "../reports/compose.ts";
import { processBatteryArticle } from "./process.ts";
import { enrichBatteryArticle } from "./summary.ts";
import { pruneBatteryBodyCache } from "./retention.ts";
import { AIDC_COMPANIES } from "@aihot/industry/aidc";
import { collectBbuAccount } from "./account-signals.ts";

const CONCURRENCY = 6;
const PRIORITY = new Set([
  "aidc-technews",
  ...AIDC_COMPANIES.flatMap(c => c.sources),
  "highgong-lithium", "lges-inside", "lges-newsroom", "samsung-sdi-global", "panasonic-energy-news",
  "nvidia-news", "nvidia-blog", "nvidia-developer", "nvidia-research", "nvidia-resources",
  "delta-press", "delta-brandnews", "infineon-press", "infineon-blog", "vertiv-news", "vertiv-blog",
]);

function rotateCandidates(rows: Array<{ id: string; source_id: string }>, limit: number): string[] {
  const bySource = new Map<string, string[]>();
  for (const row of rows) bySource.set(row.source_id, [...(bySource.get(row.source_id) ?? []), row.id]);
  const sources = [...bySource.keys()].sort((a, b) => Number(PRIORITY.has(b)) - Number(PRIORITY.has(a)) || a.localeCompare(b));
  const selected: string[] = [];
  while (selected.length < limit && sources.some((source) => bySource.get(source)!.length)) {
    for (const source of sources) {
      const id = bySource.get(source)!.shift();
      if (id) selected.push(id);
      if (selected.length >= limit) break;
    }
  }
  return selected;
}

/** One bounded daily batch. Fetches are awaited before the free report is assembled. */
export async function runBatteryDaily(now = new Date()) {
  const day = beijingDate(now.getTime());
  const lock = await sql.reserve();
  let held = false;
  try {
    const [locked] = await lock<{ locked: boolean }[]>`SELECT pg_try_advisory_lock(hashtext(${`battery-daily:${day}`})) AS locked`;
    if (!locked?.locked) return { day, state: "already-running" as const };
    held = true;
    const [completed] = await sql<{ id: number }[]>`
      SELECT id FROM job_runs WHERE job = ${`battery.daily.completed:${day}`} AND status = 'ok' LIMIT 1`;
    if (completed) return { day, state: "already-complete" as const };

    await pruneBatteryBodyCache(now);
    const sources = await sql<{ id: string }[]>`
      SELECT id FROM sources WHERE enabled AND participation_mode = 'editorial'
        AND kind IN ('rss', 'web_list', 'json_list') ORDER BY first_party DESC, id`;
    const results: Awaited<ReturnType<typeof collectSource>>[] = [];
    for (let i = 0; i < sources.length; i += CONCURRENCY) {
      results.push(...await Promise.all(sources.slice(i, i + CONCURRENCY).map(async (source) => {
        const [checkpoint] = await sql<{ result: Awaited<ReturnType<typeof collectSource>> }[]>`
          SELECT result FROM battery_daily_sources WHERE day_key = ${day}::date AND source_id = ${source.id}`;
        if (checkpoint) return checkpoint.result;
        const result = await collectSource(source.id, { force: true });
        if (result.status !== "failed") {
          await sql`INSERT INTO battery_daily_sources(day_key,source_id,result)
            VALUES(${day}::date,${source.id},${sql.json(result as never)}) ON CONFLICT DO NOTHING`;
        }
        return result;
      })));
    }
    // The queue may still be draining when the 09:00 batch reaches its report. Give a bounded
    // cross-source sample a chance to gain body evidence now; headlines are already public.
    const pending = await sql<{ id: string; source_id: string }[]>`
      SELECT a.id, a.source_id FROM articles a JOIN publications p ON p.article_id = a.id
      WHERE p.visibility = 'public' AND p.eligible AND a.body_status = 'pending'
        AND a.published_at >= ${new Date(now.getTime() - 72 * 3_600_000)}
      ORDER BY a.published_at DESC LIMIT 300`;
    const extracted: Record<string, number> = {};
    const pendingIds = rotateCandidates(pending, 20);
    for (let i = 0; i < pendingIds.length; i += 4) {
      await Promise.all(pendingIds.slice(i, i + 4).map(async (id) => {
        try {
          const state = await extractArticleBody(id, false);
          extracted[state] = (extracted[state] ?? 0) + 1;
          if (state === "ok") await processBatteryArticle(id, now);
        } catch {
          extracted.failed = (extracted.failed ?? 0) + 1;
        }
      }));
    }
    const candidates = await sql<{ id: string; source_id: string }[]>`
      SELECT a.id, a.source_id FROM articles a JOIN publications p ON p.article_id = a.id
      WHERE p.visibility = 'public' AND p.eligible AND a.published_at >= ${new Date(now.getTime() - 72 * 3_600_000)}
        AND length(coalesce(a.body_text, '')) >= 500
        AND NOT EXISTS (SELECT 1 FROM analyses x WHERE x.article_id = a.id AND x.input_revision = a.revision
          AND x.origin = 'model' AND x.output ? 'batteryCandidate')
      ORDER BY a.published_at DESC LIMIT 500`;
    const enrichment: Record<string, number> = {};
    for (const id of rotateCandidates(candidates, 50)) {
      const result = await enrichBatteryArticle(id, day, now);
      enrichment[result] = (enrichment[result] ?? 0) + 1;
      if (result === "free-no-key" || result.startsWith("free-http-") || result === "free-provider-error"
        || result === "free-unknown-usage") break;
    }
    // Community signals stay outside articles, publication, selection and daily report input.
    const accountSignals = await collectBbuAccount(now);
    const report = await composeDaily(day);
    const failures = results.filter((result) => result.status === "failed");
    if (failures.length === 0 && accountSignals.state === "ok") {
      await sql`INSERT INTO job_runs (job, status, finished_at, detail)
        VALUES (${`battery.daily.completed:${day}`}, 'ok', now(), ${sql.json({ sources: results.length, report,
          created: results.reduce((sum, result) => sum + result.created, 0),
          revised: results.reduce((sum, result) => sum + result.revised, 0), extracted, enrichment, accountSignals } as never)})`;
    }
    return {
      day, state: failures.length || accountSignals.state !== "ok" ? "partial" as const : "complete" as const,
      sources: results.length, failedSources: failures.map((result) => result.sourceId),
      created: results.reduce((sum, result) => sum + result.created, 0),
      revised: results.reduce((sum, result) => sum + result.revised, 0), extracted, enrichment, accountSignals, report,
    };
  } finally {
    try { if (held) await lock`SELECT pg_advisory_unlock(hashtext(${`battery-daily:${day}`}))`; }
    finally { lock.release(); }
  }
}

import { sql } from "../db.ts";

const EMPTY_FIELDS = { organizations: [], technologyRoutes: [], applications: [], parameters: [], evidence: [] };

interface Row {
  id: string;
  event_id: string | null;
  title: string;
  original_title: string | null;
  url: string;
  source_name: string;
  published_at: Date;
  summary: string | null;
  category: string | null;
  score: number | null;
  selected: boolean;
  tags: string[];
  output: { dimensions?: Record<string, number>; keyFacts?: Array<{ evidenceQuote: string }> } | null;
}

function toCompat(rows: Row[]) {
  if (!rows.length) return null;
  const lead = rows.find((row) => row.selected) ?? rows[0]!;
  const id = lead.event_id ?? lead.id;
  const sources = rows.map((row) => ({ name: row.source_name, url: row.url, title: row.original_title ?? row.title }));
  return {
    id, title: lead.title, title_en: lead.original_title, url: lead.url, source: lead.source_name,
    publishedAt: rows.reduce((latest, row) => row.published_at > latest ? row.published_at : latest, lead.published_at).toISOString(),
    summary: lead.summary, category: lead.category, score: lead.selected ? lead.score : null,
    selected: lead.selected, editorial: lead.selected && lead.output?.dimensions
      ? { score: lead.score, dimensions: lead.output.dimensions } : null,
    isRisk: false, riskType: null, tags: lead.selected ? lead.tags : [],
    keyFields: lead.selected ? { ...EMPTY_FIELDS, evidence: lead.output?.keyFacts?.map((f) => f.evidenceQuote) ?? [] } : EMPTY_FIELDS,
    sources, attribution: { source: "BATTERY HOT", canonical: `/api/public/items/${id}` },
  };
}

/** The old event-shaped API reads the same publication projection as the new site and RSS. */
export async function legacyItems(q: {
  mode: "selected" | "all"; since: Date; take: number; category?: string; search?: string; id?: string;
}) {
  const rows = await sql<Row[]>`
    SELECT p.article_id AS id, coalesce(m.old_id, 'battery-fact-' || p.fact_id::text) AS event_id, p.title, p.original_title, p.url,
      s.name AS source_name, p.published_at, p.summary, p.category, p.score, p.selected, p.tags, a.output
    FROM publications p JOIN sources s ON s.id = p.source_id
    LEFT JOIN battery_legacy_event_ids m ON m.fact_id = p.fact_id
    LEFT JOIN analyses a ON a.id = p.analysis_id
    WHERE p.visibility = 'public' AND p.eligible AND p.published_at IS NOT NULL
      AND (NOT p.selected OR p.visible_after <= now())
      AND (${q.id ?? null}::text IS NOT NULL OR p.published_at >= ${q.since})
      AND (${q.id ?? null}::text IS NULL OR p.article_id = ${q.id ?? null} OR m.old_id = ${q.id ?? null}
        OR 'battery-fact-' || p.fact_id::text = ${q.id ?? null})
      AND (${q.mode} = 'all' OR (p.selected AND p.visible_after <= now()))
      AND (${q.category ?? null}::text IS NULL OR p.category = ${q.category ?? null})
      AND (${q.search ?? null}::text IS NULL OR (p.title ILIKE ${q.search ? `%${q.search}%` : null} OR p.summary ILIKE ${q.search ? `%${q.search}%` : null}))
    ORDER BY p.published_at DESC, p.article_id DESC LIMIT ${q.id ? 100 : 1000}`;
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const id = row.event_id ?? row.id;
    groups.set(id, [...(groups.get(id) ?? []), row]);
  }
  return [...groups.values()].map(toCompat).filter((item) => item !== null)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, q.take);
}

interface DailyRow { key: string; generated_at: Date; content: Record<string, any>; }

export async function legacyDailies(take: number) {
  const rows = await sql<DailyRow[]>`SELECT key, generated_at, content FROM reports WHERE kind = 'daily' ORDER BY key DESC LIMIT ${take}`;
  return rows.map((r) => ({ date: r.key, title: r.content.lead?.title ?? `BATTERY HOT 早报 · ${r.key}`,
    generatedAt: r.generated_at.toISOString(), overview: r.content.overview ?? r.content.lead?.leadParagraph ?? null,
    itemCount: (r.content.sections ?? []).reduce((n: number, s: { items?: unknown[] }) => n + (s.items?.length ?? 0), 0) }));
}

export async function legacyDaily(date: string | "latest") {
  const [row] = date === "latest"
    ? await sql<DailyRow[]>`SELECT key, generated_at, content FROM reports WHERE kind = 'daily' ORDER BY key DESC LIMIT 1`
    : await sql<DailyRow[]>`SELECT key, generated_at, content FROM reports WHERE kind = 'daily' AND key = ${date}`;
  if (!row) return null;
  const content = row.content;
  return {
    date: row.key, title: content.lead?.title ?? `BATTERY HOT 早报 · ${row.key}`,
    generatedAt: row.generated_at.toISOString(), overview: content.overview ?? content.lead?.leadParagraph ?? null,
    sections: (content.sections ?? []).map((section: any) => ({
      id: String(section.id ?? section.label), label: String(section.label),
      items: (section.items ?? []).map((item: any) => ({
        title: String(item.title), summary: String(item.summary ?? ""), whyItMatters: item.whyItMatters ?? null,
        score: item.score ?? null, tags: item.tags ?? [], sourceUrls: item.sourceUrl ? [item.sourceUrl] : [],
      })),
    })),
    attribution: { source: "BATTERY HOT", canonical: `/daily#brief-${row.key}` },
  };
}

export async function legacyRefreshStatus() {
  const [run] = await sql<{ status: string; started_at: Date; finished_at: Date | null; detail: Record<string, any> | null }[]>`
    SELECT status, started_at, finished_at, detail FROM job_runs WHERE job LIKE 'battery.daily%'
    ORDER BY id DESC LIMIT 1`;
  const [visible] = await sql<{ count: number; latest: Date | null }[]>`
    SELECT count(*)::int AS count, max(published_at) AS latest FROM publications
    WHERE visibility = 'public' AND eligible AND published_at >= now() - interval '72 hours'`;
  const at = run?.finished_at ?? run?.started_at ?? new Date();
  return {
    state: run ? run.status === "running" ? "running" : run.status === "ok" ? "complete" : "failed" : "idle",
    kind: "daily", message: run ? run.status === "ok" ? "日批次已完成。" : "日批次尚未成功完成。" : "尚无日批次记录。",
    updatedAt: at.toISOString(), startedAt: run?.started_at.toISOString(), finishedAt: run?.finished_at?.toISOString(),
    visibleItems: visible?.count ?? 0, latestPublishedAt: visible?.latest?.toISOString() ?? null,
    insertedItems: run?.detail?.created ?? null,
  };
}

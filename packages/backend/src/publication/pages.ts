import { sql } from "../db.ts";
import { ITEM_COLUMNS, ITEM_FROM, listedCondition, toFeedItemSummary, type ItemRow } from "./items.ts";
import { loadAidc } from "./aidc.ts";
import { type PagesItem, publicItem } from "./pages-model.ts";

/** The Pages exit uses the same public read boundary as the live site, never a database dump. */
export async function loadPagesItems(now = new Date()): Promise<PagesItem[]> {
  const rows = await sql<Array<ItemRow & { source_title: string; topic: PagesItem["topic"]; battery_kind: PagesItem["kind"];
    aidc_priority: 0 | 1 | 2; aidc_companies: string[]; peer_sources: PagesItem["sources"];
    key_facts: Array<{ textZh: string; evidenceQuote: string; sourceUrl: string }> | null }>>`
    SELECT ${ITEM_COLUMNS}, a.title AS source_title, x.output->>'topic' AS topic,
      x.output->>'batteryKind' AS battery_kind, p.aidc_priority, p.aidc_companies,
      x.output->'decision'->'keyFacts' AS key_facts,
      (SELECT jsonb_agg(jsonb_build_object('name',ps.name,'url',peer.url) ORDER BY peer.article_id)
        FROM publications peer JOIN sources ps ON ps.id=peer.source_id
        WHERE p.fact_id IS NOT NULL AND peer.fact_id=p.fact_id AND peer.article_id<>p.article_id
          AND peer.eligible AND peer.visibility='public' AND ps.participation_mode='editorial'
          AND (NOT peer.selected OR peer.visible_after<=${now})
          AND peer.published_at IS NOT NULL AND peer.published_at<=${now}) AS peer_sources
    ${ITEM_FROM} LEFT JOIN analyses x ON x.id=p.analysis_id
    WHERE ${listedCondition(now)} AND p.eligible AND p.channel='news'
      AND p.published_at IS NOT NULL AND p.published_at <= ${now}
    ORDER BY p.published_at DESC, p.article_id DESC LIMIT 10001`;
  if (rows.length > 10000) throw new Error("Pages export capacity exceeded");
  const curated = await curatedPagesSources();
  return rows.map(r => {
    const item = toFeedItemSummary(r);
    return publicItem({
      id: r.id, sourceId: r.source_id, title: item.title, originalTitle: item.originalTitle ?? null,
      sourceTitle: r.source_title, publishedAt: item.publishedAt!, category: item.category,
      topic: r.topic, kind: r.battery_kind, summary: item.summary, score: item.score,
      facts: (r.key_facts ?? []).map(f => ({ text: f.textZh, quote: f.evidenceQuote, url: f.sourceUrl })),
      aidcPriority: r.aidc_priority, companies: r.aidc_companies,
      sources: [{ name: item.source.name, url: item.originalUrl! }, ...(r.peer_sources ?? [])],
    }, curated, now);
  }).filter((item): item is PagesItem => !!item);
}

export async function curatedPagesSources() {
  const rows = await sql<{ id: string }[]>`SELECT id FROM sources WHERE participation_mode='editorial'`;
  return new Set(rows.map(r => r.id));
}

export async function pagesAidcMetadata(now = new Date()) {
  const { community, sources } = await loadAidc(null, 1, 1, now);
  return { community, sources };
}

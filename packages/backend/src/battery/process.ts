import { sql } from "../db.ts";
import { publishArticle } from "../publication/publish.ts";
import { decideFreePublication, type FreePublicationDecision, type FreePublicationInput } from "./free-publication.ts";
import { classifyBatteryTopic } from "./topic.ts";
import type { BatterySummary } from "./summary.ts";
import { groupBatteryArticle } from "./group.ts";
import { classifyAidc } from "./aidc.ts";

interface Article {
  id: string;
  source_id: string;
  source_name: string;
  source_tier: string;
  participation_mode: string;
  first_party: boolean;
  title: string;
  url: string;
  published_at: Date | null;
  excerpt: string | null;
  body_text: string | null;
  revision: number;
  body_status: string;
}

function categoryOf(topic: string): string | null {
  if (topic === "nvidia-monitoring") return "nvidia";
  if (topic === "battery-policy") return "policy";
  if (topic === "battery-product") return "product";
  if (topic === "battery-application" || topic === "ai-data-center-backup" || topic === "aidc-infrastructure" || topic === "openai-portable-hardware") return "application";
  if (topic === "battery-technology") return "technology";
  return null;
}

/** Free evidence gate: publication happens before extraction and never waits for a model. */
export async function processBatteryArticle(articleId: string, now = new Date(), group = true): Promise<FreePublicationDecision | null> {
  const [article] = await sql<Article[]>`
    SELECT a.id, a.source_id, s.name AS source_name, s.tier AS source_tier, s.participation_mode,
      s.first_party, a.title, a.url, a.published_at, a.excerpt, a.body_text, a.body_status, a.revision
    FROM articles a JOIN sources s ON s.id = a.source_id WHERE a.id = ${articleId}`;
  if (!article) return null;
  // A retained decision belongs to this exact revision. Expiring its processing cache
  // must not turn a verified summary into a title-only card.
  if (!article.body_text && article.body_status === "ok") {
    const [stored] = await sql<{ output: { decision?: FreePublicationDecision } }[]>`
      SELECT output FROM analyses WHERE article_id = ${articleId} AND input_revision = ${article.revision}
        AND origin = 'rule' AND output ? 'batteryKind' ORDER BY id DESC LIMIT 1`;
    if (stored?.output.decision) {
      await publishArticle(articleId);
      return stored.output.decision;
    }
  }
  const [model] = await sql<{ output: { batteryCandidate?: BatterySummary } | null }[]>`
    SELECT output FROM analyses WHERE article_id = ${articleId} AND input_revision = ${article.revision}
      AND origin = 'model' AND output ? 'batteryCandidate' ORDER BY id DESC LIMIT 1`;
  const candidate = model?.output?.batteryCandidate;
  const topic = classifyBatteryTopic(article.source_id, article.title, article.body_text ?? article.excerpt ?? "");
  const input: FreePublicationInput = {
    source: {
      id: article.source_id, name: article.source_name,
      curated: article.participation_mode === "editorial", firstParty: article.first_party,
    },
    article: {
      title: article.title, url: article.url,
      publishedAt: article.published_at?.toISOString() ?? "",
      publishedAtEvidence: article.published_at ? "feed" : "unknown",
      topic, bodyText: article.body_text,
    },
    assessment: {
      sourceReliability: article.source_tier === "T1" ? 92 : 72,
      independentSourceCount: 1,
      parameters: candidate?.assessment.parameters ?? [],
      evidenceQuotes: candidate?.assessment.evidenceQuotes ?? [],
      technologyRoutes: candidate?.assessment.technologyRoutes ?? [],
      applications: candidate?.assessment.applications ?? [],
    },
    ...(candidate ? { selected: {
      titleZh: candidate.titleZh, titleEn: candidate.titleEn, summaryZh: candidate.summaryZh,
      summaryEvidenceQuote: candidate.summaryEvidenceQuote,
      keyFacts: candidate.keyFacts.map((fact) => ({ ...fact, sourceUrl: article.url })),
    } } : {}),
  };
  const decision = decideFreePublication(input, now);
  const category = categoryOf(topic);
  const relevance = decision.kind === "blocked" ? "block" : "pass";
  const summary = decision.kind === "extract-only" ? `${decision.excerpt.label}：${decision.excerpt.text}`
    : decision.kind === "selected" || decision.kind === "summarized" ? decision.summaryZh : null;
  const titleZh = decision.kind === "selected" || decision.kind === "summarized" ? decision.titleZh : null;
  const score = decision.kind === "selected" ? decision.score : null;
  const selected = decision.kind === "selected";
  const output = {
    batteryKind: decision.kind, topic, decision,
    aidc: classifyAidc(article.source_id, article.title, article.body_text ?? article.excerpt ?? ""),
    ...(decision.kind === "blocked" ? { reason: decision.reason } : {}),
    ...(decision.kind === "selected" ? { dimensions: decision.dimensions, keyFacts: decision.keyFacts, titleEn: decision.titleEn } : {}),
  };

  await sql.begin(async (tx) => {
    const [current] = await tx<{ revision: number }[]>`SELECT revision FROM articles WHERE id = ${articleId} FOR UPDATE`;
    if (!current || current.revision !== article.revision) return;
    const [previous] = await tx<{ id: number; relevance: string | null; title_zh: string | null; summary_zh: string | null; score: number | null; selected: boolean | null; output: unknown }[]>`
      SELECT id, relevance, title_zh, summary_zh, score, selected, output FROM analyses
      WHERE article_id = ${articleId} AND input_revision = ${article.revision} AND origin = 'rule'
      ORDER BY id DESC LIMIT 1`;
    if (previous?.relevance === relevance && previous.title_zh === titleZh && previous.summary_zh === summary
      && previous.score === score && previous.selected === selected && JSON.stringify(previous.output) === JSON.stringify(output)) return;
    await tx`INSERT INTO analyses (article_id, input_revision, origin, relevance, category, title_zh, summary_zh, score, selected, output)
      VALUES (${articleId}, ${article.revision}, 'rule', ${relevance}, ${category}, ${titleZh}, ${summary}, ${score}, ${selected}, ${tx.json(output as never)})`;
  });
  await publishArticle(articleId);
  if (group && decision.kind !== "blocked") await groupBatteryArticle(articleId, now);
  return decision;
}

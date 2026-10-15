import { deltaPowerExcerpt } from "./aidc.ts";

/** Publication boundary for Battery Hot's free feed. */
export type BatteryTopic =
  | "battery-technology" | "battery-product" | "battery-policy"
  | "battery-application" | "ai-data-center-backup" | "openai-portable-hardware"
  | "nvidia-monitoring" | "aidc-infrastructure"
  | "recycling" | "esg" | "grid-storage" | "non-target-chemistry"
  | "generic-finance" | "promotion" | "generic-ai" | "unrelated";

export interface FreePublicationInput {
  source: { id: string; name: string; curated: boolean; firstParty: boolean };
  article: {
    title: string;
    url: string;
    publishedAt: string;
    publishedAtEvidence: "article" | "feed" | "unknown";
    topic: BatteryTopic;
    bodyText?: string | null;
  };
  assessment?: {
    sourceReliability: number;
    independentSourceCount: number;
    parameters: string[];
    evidenceQuotes: string[];
    technologyRoutes: string[];
    applications: string[];
  };
  selected?: {
    titleZh: string;
    titleEn: string;
    summaryZh: string;
    summaryEvidenceQuote: string;
    keyFacts: Array<{ textZh: string; evidenceQuote: string; sourceUrl: string }>;
  };
}

export interface PublicationBase {
  title: string;
  publishedAt: string;
  sourceName: string;
  sourceUrl: string;
}

export type FreePublicationDecision =
  | { kind: "blocked"; reason: "uncurated-source" | "invalid-title" | "invalid-time" | "indirect-url" | "out-of-scope" }
  | ({ kind: "headline-only" } & PublicationBase)
  | ({ kind: "extract-only"; excerpt: { label: "原文摘录"; text: string } } & PublicationBase)
  | ({ kind: "summarized"; titleZh: string; titleEn: string; summaryZh: string } & PublicationBase)
  | ({
      kind: "selected";
      titleZh: string;
      titleEn: string;
      summaryZh: string;
      keyFacts: Array<{ textZh: string; evidenceQuote: string; sourceUrl: string }>;
      score: number;
      threshold: number;
      dimensions: BatteryDimensions;
    } & PublicationBase);

export type BatteryDimensions = {
  relevance: number;
  impact: number;
  evidence: number;
  authority: number;
  novelty: number;
};

export type BatteryAssessment = {
  score: number;
  threshold: number;
  passesThreshold: boolean;
  dimensions: BatteryDimensions;
};

const NVIDIA_SOURCE_IDS = new Set(["nvidia-news", "nvidia-blog", "nvidia-developer", "nvidia-research"]);
const ALLOWED_TOPICS = new Set<BatteryTopic>([
  "battery-technology", "battery-product", "battery-policy", "battery-application",
  "ai-data-center-backup", "openai-portable-hardware", "aidc-infrastructure",
]);
export function allowsBatteryTopic(sourceId: string, topic: BatteryTopic) {
  return ALLOWED_TOPICS.has(topic) || (NVIDIA_SOURCE_IDS.has(sourceId) && (topic === "nvidia-monitoring" || topic === "generic-ai"));
}
const MIN_BODY_CHARACTERS = 500;
const THRESHOLDS: Partial<Record<BatteryTopic, number>> = {
  "battery-technology": 88, "battery-product": 88, "battery-policy": 86,
  "battery-application": 88, "ai-data-center-backup": 88,
  "aidc-infrastructure": 88,
  "openai-portable-hardware": 88, "nvidia-monitoring": 88, "generic-ai": 88,
};
const BASE_RELEVANCE: Partial<Record<BatteryTopic, number>> = {
  "battery-technology": 96, "battery-product": 92, "battery-policy": 92,
  "battery-application": 94, "ai-data-center-backup": 100,
  "aidc-infrastructure": 94,
  "openai-portable-hardware": 100, "nvidia-monitoring": 92, "generic-ai": 92,
};
const BASE_IMPACT: Partial<Record<BatteryTopic, number>> = {
  "battery-technology": 88, "battery-product": 86, "battery-policy": 92,
  "battery-application": 88, "ai-data-center-backup": 92,
  "aidc-infrastructure": 88,
  "openai-portable-hardware": 90, "nvidia-monitoring": 88, "generic-ai": 88,
};

function directArticleUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (url.protocol === "http:" || url.protocol === "https:")
      && !!host && !url.username && !url.password
      && !/^news\.google\.[a-z.]+$/u.test(host)
      && !(host === "google.com" && url.pathname === "/url")
      && !(host === "www.google.com" && url.pathname === "/url");
  } catch {
    return false;
  }
}

function normalizedBody(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/gu, " ").trim();
}

function hasEvidence(body: string, quote: string): boolean {
  return quote.trim().length >= 12 && body.includes(quote.trim());
}

function numericTokens(text: string): string[] {
  return text.replace(/(?<=\d),(?=\d{3}(?:\D|$))/gu, "").match(/\d+(?:\.\d+)?/gu) ?? [];
}

function numbersSupported(text: string, evidence: string): boolean {
  const numbers = new Set(numericTokens(evidence));
  return numericTokens(text).every(number => numbers.has(number));
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(value) ? value : 0)));
}

function countPresent(body: string, values: string[]): number {
  return new Set(values.map((value) => value.trim()).filter((value) => value.length >= 4 && body.includes(value))).size;
}

/** Deterministic editorial score. Inputs are source facts and literal article evidence, never a model score. */
export function assessBatteryEvent(input: FreePublicationInput, now: Date): BatteryAssessment {
  const { article, source, assessment } = input;
  const body = normalizedBody(article.bodyText);
  const sourceCount = Math.max(1, Math.floor(assessment?.independentSourceCount ?? 1));
  const parameters = countPresent(body, assessment?.parameters ?? []);
  const evidenceQuotes = (assessment?.evidenceQuotes ?? []).filter((quote) => hasEvidence(body, quote)).length;
  const routes = countPresent(body, assessment?.technologyRoutes ?? []);
  const applications = countPresent(body, assessment?.applications ?? []);
  const text = `${article.title} ${body}`.toLowerCase();
  const priority = /\bbbu\b|backup power|数据中心|备用电源|\bopenai\b|ai hardware|ai硬件|机器人|robot|satellite|卫星|无人机|drone/u.test(text);
  const launch = /\b(new|launch|unveil|release)\b|发布|推出|首发|量产/u.test(article.title.toLowerCase());
  const ageHours = Math.max(0, (now.getTime() - Date.parse(article.publishedAt)) / 3_600_000);
  const freshness = ageHours <= 24 ? 8 : ageHours <= 72 ? 4 : ageHours <= 168 ? 0 : -12;
  const dimensions: BatteryDimensions = {
    relevance: clamp((BASE_RELEVANCE[article.topic] ?? 0) + (priority ? 6 : 0)),
    impact: clamp((BASE_IMPACT[article.topic] ?? 0) + Math.min(10, sourceCount * 3) + Math.min(8, parameters * 2) + (launch ? 4 : 0)),
    evidence: clamp(42 + Math.min(24, sourceCount * 8) + Math.min(16, parameters * 4) + Math.min(18, evidenceQuotes * 6)),
    authority: clamp(assessment?.sourceReliability ?? (source.firstParty ? 88 : 65)),
    novelty: clamp(48 + Math.min(24, routes * 6) + Math.min(16, applications * 4) + (launch ? 8 : 0) + freshness),
  };
  const score = Math.round(dimensions.relevance * 0.25 + dimensions.impact * 0.24
    + dimensions.evidence * 0.20 + dimensions.authority * 0.19 + dimensions.novelty * 0.12);
  const threshold = THRESHOLDS[article.topic] ?? 100;
  return { score, threshold, passesThreshold: score >= threshold, dimensions };
}

/** Caller supplies the clock so the same input always yields the same decision. */
export function decideFreePublication(input: FreePublicationInput, now: Date): FreePublicationDecision {
  const { source, article, selected } = input;
  if (!source.curated) return { kind: "blocked", reason: "uncurated-source" };
  if (!article.title.trim()) return { kind: "blocked", reason: "invalid-title" };
  const published = Date.parse(article.publishedAt);
  const current = now.getTime();
  if (article.publishedAtEvidence === "unknown"
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u.test(article.publishedAt)
      || !Number.isFinite(published) || !Number.isFinite(current)
      || published > current + 5 * 60_000) return { kind: "blocked", reason: "invalid-time" };
  if (!directArticleUrl(article.url)) return { kind: "blocked", reason: "indirect-url" };
  if (!allowsBatteryTopic(source.id, article.topic)) {
    return { kind: "blocked", reason: "out-of-scope" };
  }

  const base: PublicationBase = {
    title: article.title.trim(), publishedAt: new Date(published).toISOString(),
    sourceName: source.name, sourceUrl: article.url,
  };
  const body = normalizedBody(article.bodyText);
  if (body.length < MIN_BODY_CHARACTERS) return { kind: "headline-only", ...base };

  const assessment = assessBatteryEvent(input, now);
  const summaryReady = !!selected && /\p{Script=Han}/u.test(selected.titleZh)
    && /[a-z]/iu.test(selected.titleEn) && /\p{Script=Han}/u.test(selected.summaryZh)
    && numbersSupported(selected.titleZh, `${article.title} ${body}`)
    && numbersSupported(selected.titleEn, `${article.title} ${body}`)
    && hasEvidence(body, selected.summaryEvidenceQuote)
    && numbersSupported(selected.summaryZh, selected.summaryEvidenceQuote);
  const factsValid = selected?.keyFacts.every((fact) => /\p{Script=Han}/u.test(fact.textZh)
    && fact.sourceUrl === article.url && hasEvidence(body, fact.evidenceQuote)
    && numbersSupported(fact.textZh, fact.evidenceQuote)) ?? false;
  if (summaryReady && factsValid && assessment.passesThreshold && selected!.keyFacts.length > 0) {
    return {
      kind: "selected", ...base,
      titleZh: selected!.titleZh.trim(), titleEn: selected!.titleEn.trim(),
      summaryZh: selected!.summaryZh.trim(),
      keyFacts: selected!.keyFacts.map((fact) => ({
        textZh: fact.textZh.trim(), evidenceQuote: fact.evidenceQuote.trim(), sourceUrl: fact.sourceUrl,
      })),
      score: assessment.score, threshold: assessment.threshold, dimensions: assessment.dimensions,
    };
  }

  if (summaryReady && factsValid) return {
    kind: "summarized", ...base,
    titleZh: selected!.titleZh.trim(), titleEn: selected!.titleEn.trim(), summaryZh: selected!.summaryZh.trim(),
  };

  return { kind: "extract-only", ...base, excerpt: { label: "原文摘录", text: deltaPowerExcerpt(source.id, body) } };
}

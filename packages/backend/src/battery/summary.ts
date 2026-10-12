import { z } from "zod";
import { config, credential } from "../config.ts";
import { sql } from "../db.ts";
import { paidRequest, completeReceipt, ProviderRejectedError, BudgetExceededError } from "../providers/receipts.ts";
import { deepSeekCostNanoUsd, DAILY_LIMIT_NANO_USD, shanghaiDateKey } from "./budget.ts";
import { processBatteryArticle } from "./process.ts";

const MAX_OUTPUT_TOKENS = 900;
const ArticleSchema = z.object({
  titleZh: z.string().min(2).max(180),
  titleEn: z.string().min(2).max(180),
  summaryZh: z.string().min(30).max(900),
  summaryEvidenceQuote: z.string().min(12).max(500),
  keyFacts: z.array(z.object({ textZh: z.string().min(4).max(200), evidenceQuote: z.string().min(12).max(300) })).max(5),
  assessment: z.object({
    parameters: z.array(z.string().max(80)).max(8),
    evidenceQuotes: z.array(z.string().max(300)).max(6),
    technologyRoutes: z.array(z.string().max(80)).max(6),
    applications: z.array(z.string().max(80)).max(6),
  }),
});

export type BatterySummary = z.infer<typeof ArticleSchema>;

interface Candidate {
  id: string;
  source_id: string;
  title: string;
  url: string;
  body_text: string | null;
  published_at: Date | null;
  revision: number;
}

async function disableRound(roundId: string, reason: string): Promise<void> {
  await sql`INSERT INTO battery_model_rounds(id, disabled_reason) VALUES (${roundId}, ${reason})
    ON CONFLICT(id) DO UPDATE SET disabled_reason = EXCLUDED.disabled_reason, updated_at = now()`;
}

async function closeAttempt(id: string, state: "unknown" | "complete" | "declined", charge: number, reason: string | null = null) {
  await sql`UPDATE battery_model_attempts SET state = ${state}, charged_nano_usd = ${charge}, reason = ${reason}, updated_at = now()
    WHERE id = ${id}`;
}

async function reserve(id: string, roundId: string, dayKey: string, articleId: string, cost: number): Promise<boolean> {
  return sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`battery-budget:${dayKey}`}))`;
    const [round] = await tx<{ disabled_reason: string | null }[]>`SELECT disabled_reason FROM battery_model_rounds WHERE id = ${roundId}`;
    if (round?.disabled_reason) return false;
    const [existing] = await tx`SELECT 1 FROM battery_model_attempts WHERE id = ${id}`;
    if (existing) return false;
    const [unknown] = await tx`SELECT 1 FROM battery_model_attempts WHERE article_id = ${articleId} AND state IN ('pending', 'unknown') LIMIT 1`;
    if (unknown) return false;
    const [total] = await tx<{ amount: string }[]>`
      SELECT coalesce(sum(CASE WHEN state = 'complete' THEN charged_nano_usd
        WHEN state IN ('pending', 'unknown') THEN reserved_nano_usd ELSE 0 END), 0)::text AS amount
      FROM battery_model_attempts WHERE day_key = ${dayKey}::date`;
    if (Number(total?.amount ?? 0) + cost > DAILY_LIMIT_NANO_USD) return false;
    await tx`INSERT INTO battery_model_attempts(id, round_id, day_key, article_id, reserved_nano_usd, state)
      VALUES (${id}, ${roundId}, ${dayKey}::date, ${articleId}, ${cost}, 'pending')`;
    return true;
  });
}

/** A single bounded Flash call. Any unavailable or unknown-billing outcome leaves the free feed running. */
export async function enrichBatteryArticle(articleId: string, roundId: string, now = new Date()): Promise<string> {
  const key = credential("models", "LLM_API_KEY") ?? credential("models", "DEEPSEEK_API_KEY");
  if (!config.modelCallsEnabled || !key) return "free-no-key";
  const [article] = await sql<Candidate[]>`
    SELECT id, source_id, title, url, body_text, published_at, revision FROM articles WHERE id = ${articleId}`;
  if (!article?.body_text || article.body_text.trim().length < 500 || !article.published_at
      || now.getTime() - article.published_at.getTime() > 72 * 3_600_000) return "no-body-evidence";

  const body = article.body_text.replace(/\s+/gu, " ").trim().slice(0, 12_000);
  const system = `你是电池产业新闻编辑。只依据给定正文输出 JSON。标题译为中英文；中文概览与关键事实必须被正文逐字引文支持。引文须从正文连续复制，禁止猜测或提供评分。
返回结构：{"titleZh":"中文标题","titleEn":"English title","summaryZh":"30字以上中文精华总结","summaryEvidenceQuote":"正文连续引文","keyFacts":[{"textZh":"中文事实","evidenceQuote":"正文连续引文"}],"assessment":{"parameters":[],"evidenceQuotes":[],"technologyRoutes":[],"applications":[]}}。
assessment 的每一项都须连续复制正文，不能翻译、改写或补充。最多5条事实；不确定的数据省略。`;
  const user = `原文标题：${article.title}\n原文链接：${article.url}\n正文：${body}`;
  const messages = [{ role: "system", content: system }, { role: "user", content: user }];
  const inputLimit = Buffer.byteLength(JSON.stringify(messages), "utf8") + 512;
  const reserved = deepSeekCostNanoUsd(inputLimit, MAX_OUTPUT_TOKENS);
  const baseUrl = (credential("models", "LLM_BASE_URL") ?? credential("models", "DEEPSEEK_BASE_URL")
    ?? "https://api.deepseek.com/v1").replace(/\/+$/u, "");
  try {
    if (new URL(baseUrl).hostname !== "api.deepseek.com") return "free-unsupported-provider";
  } catch { return "free-unsupported-provider"; }
  const dayKey = shanghaiDateKey(now);
  const requestId = `${dayKey}:${article.id}:${article.revision}`;
  if (!await reserve(requestId, roundId, dayKey, article.id, reserved)) return "free-budget-or-duplicate";

  let receiptId: number;
  let payload: {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  try {
    const receipt = await paidRequest({
      service: "llm", model: "deepseek-flash", purpose: "battery_summary", subject: `article:${articleId}`,
      identity: { requestId, baseUrl, system, user, maxOutputTokens: MAX_OUTPUT_TOKENS },
      requestSummary: { articleId, revision: article.revision, inputHashOnly: true, maxOutputTokens: MAX_OUTPUT_TOKENS },
    }, async () => {
      const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST", signal: AbortSignal.timeout(45_000),
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: "deepseek-flash", messages, max_tokens: MAX_OUTPUT_TOKENS, temperature: 0.1,
        response_format: { type: "json_object" }, thinking: { type: "disabled" },
      }),
      });
      if (!response.ok) {
        if (response.status === 402 || response.status === 401) {
          throw new ProviderRejectedError(`http-${response.status}`, response.status, false);
        }
        throw new Error(`http-${response.status}`);
      }
      const result = await response.json() as typeof payload;
      const input = result.usage?.prompt_tokens;
      const output = result.usage?.completion_tokens;
      if (!Number.isSafeInteger(input) || !Number.isSafeInteger(output) || input! < 0 || output! < 0) {
        throw new Error("missing-usage");
      }
      // Receipts contain the generated summary and usage only, never the submitted article body.
      return { response: result, usage: result.usage, cost: {
        amount: deepSeekCostNanoUsd(input!, output!) / 1e9, currency: "USD", basis: "actual",
      } };
    });
    receiptId = receipt.receiptId;
    payload = receipt.response as typeof payload;
  } catch (error) {
    const declined = error instanceof ProviderRejectedError || error instanceof BudgetExceededError;
    const reason = error instanceof ProviderRejectedError ? `http-${error.status}`
      : error instanceof BudgetExceededError ? "receipt-budget-exhausted" : "provider-unknown-outcome";
    await closeAttempt(requestId, declined ? "declined" : "unknown", 0, reason);
    await disableRound(roundId, reason);
    if (error instanceof ProviderRejectedError) return `free-http-${error.status}`;
    return "free-provider-error";
  }
  const inputTokens = payload.usage?.prompt_tokens;
  const outputTokens = payload.usage?.completion_tokens;
  if (!Number.isSafeInteger(inputTokens) || !Number.isSafeInteger(outputTokens) || inputTokens! < 0 || outputTokens! < 0) {
    await closeAttempt(requestId, "unknown", 0, "missing-usage");
    await disableRound(roundId, "missing-usage");
    return "free-unknown-usage";
  }
  await closeAttempt(requestId, "complete", deepSeekCostNanoUsd(inputTokens!, outputTokens!));
  await completeReceipt(sql, receiptId);
  let data: unknown;
  try { data = JSON.parse(payload.choices?.[0]?.message?.content ?? "null"); }
  catch { return "invalid-summary"; }
  const parsed = ArticleSchema.safeParse(data);
  if (!parsed.success) return "invalid-summary";
  const summary = parsed.data;
  try {
    await sql`INSERT INTO analyses(article_id, input_revision, origin, model, relevance, title_zh, summary_zh, selected, output)
      VALUES (${article.id}, ${article.revision}, 'model', 'deepseek-flash', 'unknown', ${summary.titleZh},
        ${summary.summaryZh}, false, ${sql.json({ batteryCandidate: summary } as never)})`;
    const decision = await processBatteryArticle(article.id, now);
    return decision?.kind ?? "missing";
  } catch {
    return "publication-error";
  }
}

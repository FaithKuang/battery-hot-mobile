import { ENTITIES } from "@aihot/industry/taxonomy";
import { sql } from "../db.ts";
import { newUuid } from "../lib/ids.ts";
import { publishArticleTx } from "../publication/publish.ts";
import { normalizeText, shouldMergeEvents } from "./merge-rules.ts";

export function mergeIdentity(title: string, topic: string) {
  const text = normalizeText(title);
  const organizations = Object.entries(ENTITIES).filter(([, entity]) =>
    entity.aliases.some(alias => text.includes(normalizeText(alias)))).map(([id]) => id);
  const route = text.match(/solid state|固态|silicon anode|硅基负极|lithium metal|锂金属|\blfp\b|\blmfp\b/)?.[0] ?? "";
  // Include the actual title to avoid identical empty/entity-only signatures.
  return { organizations, signature: [topic, "normal", organizations[0] ?? "", route, text].join("|") };
}

/** Code-only grouping, serialized across processes. Existing and manual memberships stay intact. */
export async function groupBatteryArticle(articleId: string, now = new Date()) {
  const result = await sql.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(hashtext('battery-group'))`;
    const [member] = await tx<{ fact_id: number }[]>`SELECT fact_id FROM fact_articles
      WHERE article_id=${articleId} AND role IN ('primary','report') LIMIT 1`;
    if (member) return { factId: member.fact_id, created: false };
    const [article] = await tx<{ title: string; published_at: Date; category: string; topic: string }[]>`
      SELECT a.title, a.published_at, p.category, x.output->>'topic' AS topic
      FROM articles a JOIN publications p ON p.article_id=a.id JOIN analyses x ON x.id=p.analysis_id
      WHERE a.id=${articleId} AND p.visibility='public' AND p.eligible AND a.published_at IS NOT NULL`;
    if (!article || now.getTime() - article.published_at.getTime() > 72 * 3_600_000) return null;
    const identity = mergeIdentity(article.title, article.topic);
    const candidates = await tx<{ fact_id: number; title: string; topic: string }[]>`
      SELECT DISTINCT p.fact_id, a.title, x.output->>'topic' AS topic
      FROM publications p JOIN articles a ON a.id=p.article_id JOIN analyses x ON x.id=p.analysis_id
      WHERE p.fact_id IS NOT NULL AND p.visibility='public' AND p.eligible
        AND p.category=${article.category}
        AND a.published_at BETWEEN ${new Date(article.published_at.getTime()-72*3_600_000)}
          AND ${new Date(article.published_at.getTime()+72*3_600_000)}
      ORDER BY p.fact_id DESC LIMIT 300`;
    const match = candidates.find(candidate => {
      const other = mergeIdentity(candidate.title, candidate.topic);
      return shouldMergeEvents(article.title, candidate.title, identity.signature, other.signature,
        identity.organizations, other.organizations);
    });
    let factId = match?.fact_id;
    if (!factId) {
      const [story] = await tx<{ id: number }[]>`INSERT INTO stories(public_id,title,origin,first_report_at,latest_at)
        VALUES(${newUuid()},${article.title},'manual',${article.published_at},${article.published_at}) RETURNING id`;
      const [fact] = await tx<{ id: number }[]>`INSERT INTO facts(public_id,story_id,title,manual)
        VALUES(${`battery:${articleId}`},${story!.id},${article.title},false) RETURNING id`;
      factId = fact!.id;
    }
    await tx`INSERT INTO fact_articles(fact_id,article_id,role,manual)
      VALUES(${factId},${articleId},${match ? 'report' : 'primary'},false) ON CONFLICT DO NOTHING`;
    await tx`UPDATE articles SET grouped_at=now() WHERE id=${articleId}`;
    await tx`UPDATE stories SET latest_at=greatest(latest_at,${article.published_at}),updated_at=now()
      WHERE id=(SELECT story_id FROM facts WHERE id=${factId})`;
    await publishArticleTx(tx, articleId);
    return { factId, created: !match };
  });
  return result;
}

import { sql } from "../db.ts";

/** Hourly cleanup uses a 23-hour deadline, leaving one hour of margin to the 24-hour cap.
 * Evidence excerpts, content hashes, decisions and historical archive rows are retained.
 */
export async function pruneBatteryBodyCache(now = new Date()) {
  if (process.env.BATTERY_MODE !== "true") return { articles: 0, revisions: 0, translations: 0 };
  const cutoff = new Date(now.getTime() - 23 * 3_600_000);
  return sql.begin(async (tx) => {
    const articles = await tx`UPDATE articles SET body_text = NULL, body_html = NULL, raw = NULL
      WHERE body_cached_at <= ${cutoff} AND (body_text IS NOT NULL OR body_html IS NOT NULL)`;
    const revisions = await tx`UPDATE article_revisions SET body_text = NULL
      WHERE created_at <= ${cutoff} AND body_text IS NOT NULL`;
    const translations = await tx`UPDATE translations SET body_text = NULL, body_html = NULL
      WHERE created_at <= ${cutoff} AND (body_text IS NOT NULL OR body_html IS NOT NULL)`;
    return { articles: articles.count, revisions: revisions.count, translations: translations.count };
  });
}

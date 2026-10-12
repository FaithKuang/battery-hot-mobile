import * as cheerio from "cheerio";
import { collapseWhitespace } from "../lib/text.ts";
import { allowed, parseLooseDate } from "./web-list.ts";
import type { Candidate, SourceRow } from "./types.ts";

/** Dates are read from the same card as the article, never the page footer. */
export function supplierNews(html: string, base: string, source: SourceRow): Candidate[] {
  const $ = cheerio.load(html);
  const out: Candidate[] = [];
  const simplo = source.id === "simplo-news" || source.id === "aes-news";
  const delta = source.id === "delta-press";
  const selector = simplo ? ".row.item" : delta ? "a[href]" : source.config.itemSelector;
  for (const node of $(selector).toArray()) {
    const card = $(node);
    const link = simplo ? card.find("a.article_subject").first() : delta ? card : card.find(source.config.linkSelector).first();
    const href = link.attr("href");
    if (!href) continue;
    const url = new URL(href, base).toString();
    if (!/^https?:/.test(url) || !allowed(url, source) || out.some(c => c.url === url)) continue;
    if (delta && !/\/press\/\d+$/.test(new URL(url).pathname)) continue;
    const title = collapseWhitespace(simplo ? link.text() : delta ? card.find("span.whitespace-pre-line").text() : card.find(source.config.titleSelector).text());
    if (!title) continue;
    let date: string | undefined;
    if (simplo) {
      const month = card.find(".yearmonth").text().replace(/\s+/g, "");
      const day = card.find(".day").text().trim();
      if (/^\d{4}\/\d{2}$/.test(month) && /^\d{1,2}$/.test(day)) date = `${month}/${day}`;
    } else if (delta) {
      const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(card.text());
      if (m) date = `${m[3]}-${m[1]}-${m[2]}`;
    } else {
      date = card.find(source.config.publishedAtSelector).text().trim();
      const m = /^([A-Za-z]{3})\s*(\d{1,2}),\s*(\d{4})$/.exec(date);
      if (m) {
        const month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(m[1]!.toLowerCase()) + 1;
        date = month ? `${m[3]}-${String(month).padStart(2, "0")}-${m[2]!.padStart(2, "0")}` : undefined;
      }
    }
    out.push({ url, title, publishedAt: parseLooseDate(date, "+08:00") });
  }
  return out;
}

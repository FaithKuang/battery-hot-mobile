import assert from "node:assert/strict";
import { test } from "node:test";
import { publicItem, publicUrl, mergePagesItems, pagesReport, type PagesItem } from "@aihot/backend/publication/pages-model";

const now = new Date("2026-10-12T01:00:00Z");
const curated = new Set(["catl", "other", "nvidia-news"]);
function item(overrides: Partial<PagesItem> = {}): PagesItem {
  return { id: "ignored", sourceId: "catl", title: "CATL launches lithium battery Alpha",
    originalTitle: null, sourceTitle: "CATL launches lithium battery Alpha", publishedAt: "2026-10-11T05:00:00Z",
    category: "新产品", topic: "battery-product", kind: "headline-only", summary: "must not leak",
    score: 99, facts: [{ text: "must not leak", quote: "unverified evidence quote", url: "https://example.com/a" }],
    aidcPriority: 0, companies: [], sources: [{ name: "CATL", url: "https://example.com/a" }], ...overrides };
}
test("Pages strips all inference from headline cards and rejects unsafe or indirect links", () => {
  const result = publicItem(item(), curated, now)!;
  assert.equal(result.summary, null); assert.equal(result.score, null);
  assert.deepEqual(result.facts, []); assert.equal(result.originalTitle, null);
  for (const url of ["http://localhost/a", "http://127.0.0.1/a", "http://192.168.0.1/a", "javascript:alert(1)",
    "https://news.google.com/rss/articles/1", "https://example.com/?api_key=private", "https://user:pass@example.com/a"]) {
    assert.equal(publicUrl(url), null, url);
  }
  assert.equal(publicUrl("https://example.com/a?utm_source=test"), "https://example.com/a");
});
test("Pages retains curated and NVIDIA boundaries, dates, and independent BBU priority", () => {
  assert.equal(publicItem(item({ sourceId: "unknown" }), curated, now), null);
  assert.equal(publicItem(item({ topic: "recycling" }), curated, now), null);
  assert.equal(publicItem(item({ topic: "generic-ai" }), curated, now), null);
  assert.ok(publicItem(item({ sourceId: "nvidia-news", topic: "nvidia-monitoring" }), curated, now));
  assert.equal(publicItem(item({ sourceId: "nvidia-research", topic: "nvidia-monitoring",
    sources: [{ name: "NVIDIA", url: "https://research.nvidia.com/person/example" }] }), new Set([...curated, "nvidia-research"]), now), null);
  assert.equal(publicItem(item({ publishedAt: "2026-10-13T01:00:00Z" }), curated, now), null);
  const bbu = publicItem(item({ aidcPriority: 2, title: "CATL launches BBU for AI data centers",
    sourceTitle: "CATL launches BBU for AI data centers", topic: "ai-data-center-backup" }), curated, now)!;
  assert.equal(bbu.aidcPriority, 2); assert.equal(bbu.kind, "headline-only");
});
test("Pages reimport is idempotent and merges known event sources without merging unrelated products", () => {
  const first = item(); const second = item({ sourceId: "other", sources: [{ name: "Other", url: "https://example.org/b" }] });
  const merged = mergePagesItems([], [first, second], curated, now);
  assert.equal(merged.length, 1); assert.equal(merged[0]!.sources.length, 2);
  assert.deepEqual(mergePagesItems(merged, [first, second], curated, now), merged);
  assert.equal(mergePagesItems([], [first, item({ title: "LGES launches lithium battery Beta", sourceTitle: "LGES launches lithium battery Beta",
    sources: [{ name: "Other", url: "https://example.org/c" }] })], curated, now).length, 2);
});
test("Saved summaries survive only unchanged article observations; revisions cannot inherit old evidence", () => {
  const rich = item({ kind: "selected", title: "宁德时代发布锂电池 Alpha", originalTitle: "CATL launches lithium battery Alpha",
    summary: "宁德时代发布锂电池。", score: 90 });
  const saved = mergePagesItems([rich], [item()], curated, now);
  assert.equal(saved[0]!.kind, "selected");
  const revised = mergePagesItems(saved, [item({ sourceTitle: "CATL retracts lithium battery Alpha" })], curated, now);
  assert.equal(revised[0]!.kind, "headline-only"); assert.equal(revised[0]!.summary, null);
});
test("Reports use the previous Beijing calendar day, not a rolling UTC window", () => {
  const selected = publicItem(item({ kind: "selected", title: "宁德时代发布锂电池", originalTitle: "CATL launches lithium battery Alpha",
    summary: "宁德时代发布锂电池。", score: 90 }), curated, now)!;
  const report = pagesReport([selected], now);
  assert.equal(report.windowStart, "2026-10-10T16:00:00.000Z");
  assert.equal(report.windowEnd, "2026-10-11T16:00:00.000Z"); assert.deepEqual(report.itemIds, [selected.id]);
  assert.equal(pagesReport([item()], now).itemIds.length, 0);
});
test("Pages rejects generic cells, unrelated science and warfare even if a stale scope label passed", () => {
  for (const title of ["Temporary melting liquid improves solar cells", "New electrical method detects alien life",
    "Samsung NAND profits seen surging 40-fold", "Ukraine drones knock out AI data center"]) {
    assert.equal(publicItem(item({ title, sourceTitle: title, summary: null }), curated, now), null, title);
  }
});

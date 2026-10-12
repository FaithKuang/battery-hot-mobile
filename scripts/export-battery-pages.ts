import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { closeDb } from "@aihot/backend/db";
import { loadPagesItems, curatedPagesSources, pagesAidcMetadata } from "@aihot/backend/publication/pages";
import { mergePagesItems, pagesReport, type PagesSnapshot } from "@aihot/backend/publication/pages-model";

if (process.env.BATTERY_MODE !== "true") throw new Error("Pages export requires Battery Hot publication rules");
const destination = path.resolve(process.argv[2] ?? "public-data/news.json");
const previous: PagesSnapshot | null = existsSync(destination) ? JSON.parse(readFileSync(destination, "utf8")) : null;
if (previous && previous.version !== 1) throw new Error("Unsupported public snapshot version");
try {
  const now = new Date();
  const items = mergePagesItems(previous?.items ?? [], await loadPagesItems(now), await curatedPagesSources(), now);
  const aidc = await pagesAidcMetadata(now);
  // A public-page read failure never erases the previous community list or successful check date.
  const community = aidc.community.items.length || !previous ? aidc.community
    : { account: { ...aidc.community.account, checkedAt: previous.community.account.checkedAt }, items: previous.community.items };
  const resultFile = process.argv[3];
  const run = resultFile ? JSON.parse(readFileSync(resultFile, "utf8")) : null;
  const check: PagesSnapshot["check"] = run
    ? { at: now.toISOString(), state: run.state === "complete" ? "complete" : "partial", sources: run.sources,
      failedSources: run.failedSources ?? [] }
    : { at: now.toISOString(), state: "snapshot", sources: 0, failedSources: [] };
  const olderReports = (previous?.reports ?? []).map(report => ({ ...report, itemIds: report.itemIds.flatMap(id => {
    const old = previous?.items.find(i => i.id === id);
    const current = old && items.find(i => i.kind === "selected" && i.sources.some(s => old.sources.some(o => o.url === s.url)));
    return current ? [current.id] : [];
  }) }));
  const reports = [...new Map([...olderReports, pagesReport(items, now)].map(r => [r.date, r])).values()]
    .sort((a, b) => b.date.localeCompare(a.date));
  const snapshot: PagesSnapshot = { version: 1, generatedAt: now.toISOString(), check, items, ...aidc, community, reports };
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, JSON.stringify(snapshot) + "\n");
  console.log(JSON.stringify({ exported: items.length, selected: items.filter(i => i.kind === "selected").length,
    bbu: items.filter(i => i.aidcPriority === 2).length, community: community.items.length, state: check.state }));
} finally { await closeDb(); }

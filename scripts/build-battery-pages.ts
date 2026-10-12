import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { escapeXml } from "@aihot/backend/lib/text";
import type { PagesSnapshot } from "@aihot/backend/publication/pages-model";

const root = path.resolve(import.meta.dirname, "..");
const snapshot: PagesSnapshot = JSON.parse(readFileSync(path.resolve(process.argv[2] ?? "public-data/news.json"), "utf8"));
const out = path.resolve(process.argv[3] ?? "dist/pages");
if (snapshot.version !== 1 || !snapshot.items.length) throw new Error("Refusing to deploy an empty or invalid public snapshot");
mkdirSync(path.join(out, "feed"), { recursive: true });
for (const file of ["index.html", "app.js", "style.css", "manifest.webmanifest"]) cpSync(path.join(root, "pages", file), path.join(out, file));
cpSync(path.join(root, "industry/brand/icon-192.png"), path.join(out, "icon.png"));
cpSync(path.join(root, "industry/brand/apple-icon.png"), path.join(out, "apple-icon.png"));
writeFileSync(path.join(out, "news.json"), JSON.stringify(snapshot) + "\n");
writeFileSync(path.join(out, ".nojekyll"), "");
for (const name of ["LICENSE", "NOTICE"]) cpSync(path.join(root, name), path.join(out, name));
const items = snapshot.items.slice(0, 100).map(i => `<item><title>${escapeXml(i.title)}</title><link>${escapeXml(i.sources[0]!.url)}</link><guid isPermaLink="false">${i.id}</guid><pubDate>${new Date(i.publishedAt).toUTCString()}</pubDate>${i.kind !== "headline-only" && i.summary ? `<description>${escapeXml(i.summary)}</description>` : ""}</item>`);
writeFileSync(path.join(out, "feed/all.xml"), `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>BATTERY HOT — 全部动态</title><link>${escapeXml(process.env.PAGES_SITE_URL ?? "https://faithkuang.github.io/battery-hot-mobile/")}</link><description>免费采集，可信日期，直达原文</description>${items.join("")}</channel></rss>\n`);
console.log(JSON.stringify({ built: snapshot.items.length, directory: path.relative(root, out) }));

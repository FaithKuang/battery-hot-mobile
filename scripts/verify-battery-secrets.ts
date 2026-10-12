import { readFileSync, readdirSync, existsSync } from "node:fs";
import { parseEnv } from "node:util";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const values = new Set<string>();
for (const file of [path.join(root, ".env"), path.join(root, ".env.local"), path.join(root, "../battery_hot/.env.local")]) {
  if (!existsSync(file)) continue;
  for (const [name, value] of Object.entries(parseEnv(readFileSync(file, "utf8")))) {
    if (/(?:API_KEY|SECRET|PASSWORD|TOKEN)$/u.test(name) && value.length >= 12) values.add(value);
  }
}
for (const [name, value] of Object.entries(process.env)) {
  if (value && /(?:API_KEY|SECRET|PASSWORD|TOKEN)$/u.test(name) && value.length >= 12) values.add(value);
}
function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? files(file) : entry.isFile() ? [file] : [];
  });
}
const outputs = ["apps/web/build", "apps/web/public", "dist/pages", "public-data"].flatMap(dir => files(path.join(root, dir)));
for (const file of outputs) if (path.basename(file).startsWith(".env")) throw new Error("Environment file in public output");
const checked = [...new Set([...outputs, ...["industry", "docs", "scripts", "packages", "pages", ".github", "apps/api/src", "apps/worker/src", "apps/web/app"]
  .flatMap(dir => files(path.join(root, dir))), ...["README.md", "PROGRESS.md", "AGENTS.md"].map(file => path.join(root, file))])];
for (const file of checked) {
  if (!existsSync(file)) continue;
  const content = readFileSync(file);
  for (const value of values) if (content.includes(Buffer.from(value))) throw new Error(`Secret boundary failure: ${path.relative(root, file)}`);
}
console.log(`Secret boundary passed across ${checked.length} source/public files; no secret values printed.`);

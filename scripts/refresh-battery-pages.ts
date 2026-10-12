// Cloud one-shot collector. Refuses local/production databases and never starts a worker or API.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { closeDb, sql } from "@aihot/backend/db";
import { stopBoss } from "@aihot/backend/jobs/queue";
import { runBatteryDaily } from "@aihot/backend/battery/daily";

const db = new URL(process.env.DATABASE_URL ?? "postgres://unset/unset");
if (process.env.BATTERY_MODE !== "true" || db.pathname !== "/batteryhot_pages_ci"
  || !["localhost", "127.0.0.1"].includes(db.hostname) || process.env.MODEL_CALLS_ENABLED !== "false") {
  throw new Error("Cloud collection requires the isolated Pages database and paid calls disabled");
}
for (const name of ["LLM_API_KEY", "DEEPSEEK_API_KEY", "OPENAI_API_KEY", "JINA_API_KEY", "XAI_API_KEY", "BRAVE_API_KEY"]) {
  if (process.env[name]) throw new Error("No paid API credentials may be supplied to the free Pages collector");
}
try {
  // Each runner is ephemeral. Do not apply the first-import 8-item cap on every daily fetch.
  await sql`UPDATE sources SET cursor=jsonb_build_object('initializedAt', now()),site_fulltext=false,syndicate_fulltext=false`;
  const result = await runBatteryDaily();
  const [{ count }] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM receipt_attempts`;
  if (count !== 0) throw new Error("Free cloud run unexpectedly produced provider receipts");
  const output = process.argv[2] ?? ".data/pages-run.json";
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(result));
  console.log(JSON.stringify({ state: result.state, sources: "sources" in result ? result.sources : 0,
    created: "created" in result ? result.created : 0, paidCalls: count }));
} finally { await stopBoss(); await closeDb(); }

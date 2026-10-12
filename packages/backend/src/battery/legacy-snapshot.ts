import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { closeSync, existsSync, openSync, realpathSync } from "node:fs";
import path from "node:path";
import { sql } from "../db.ts";

type Origin = "formal" | "signals";
interface SchemaEntry { type: string; name: string; tbl_name: string; sql: string }
interface Row { rowid: number; payload: Record<string, unknown>; hash: string }
interface Table { name: string; rows: Row[]; digest: string }
interface Snapshot { schema: SchemaEntry[]; schemaHash: string; tables: Table[] }

export function canonicalLegacy(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalLegacy).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalLegacy(v)}`).join(",")}}`;
  return JSON.stringify(value);
}
const hash = (value: unknown) => createHash("sha256").update(canonicalLegacy(value)).digest("hex");
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;
function encoded(value: unknown): unknown {
  if (value instanceof Uint8Array) return { _sqlite_blob_base64: Buffer.from(value).toString("base64") };
  if (typeof value === "bigint") return { _sqlite_int64: value.toString() };
  return value;
}
function decoded(value: unknown): string | number | bigint | Uint8Array | null {
  if (value && typeof value === "object" && "_sqlite_blob_base64" in value) return Buffer.from(String(value._sqlite_blob_base64), "base64");
  if (value && typeof value === "object" && "_sqlite_int64" in value) return BigInt(String(value._sqlite_int64));
  if (value === null || typeof value === "string" || typeof value === "number") return value;
  throw new Error("Unsupported archived SQLite value");
}

/** Never use live WAL-backed files as migration input; the caller must provide consistent backups. */
export function assertLegacySnapshotPath(file: string): void {
  const resolved = realpathSync(file);
  const production = path.resolve(import.meta.dirname, "../../../../../battery_hot");
  if (resolved === production || resolved.startsWith(`${production}${path.sep}`)) throw new Error("Use a verified backup, not the production directory");
}

function readSnapshot(file: string): Snapshot {
  assertLegacySnapshotPath(file);
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    if ((db.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check !== "ok") throw new Error("SQLite integrity check failed");
    const schema = db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type,name").all() as unknown as SchemaEntry[];
    const tables = schema.filter(entry => entry.type === "table").map(entry => {
      const digest = createHash("sha256");
      const rows: Row[] = [];
      for (const record of db.prepare(`SELECT rowid AS _migration_rowid,* FROM ${quote(entry.name)} ORDER BY rowid`).iterate()) {
        const rowid = Number(record._migration_rowid);
        if (!Number.isSafeInteger(rowid)) throw new Error("Unsafe SQLite rowid");
        const payload = Object.fromEntries(Object.entries(record).filter(([k]) => k !== "_migration_rowid").map(([k, v]) => [k, encoded(v)]));
        const rowHash = hash(payload);
        rows.push({ rowid, payload, hash: rowHash });
        digest.update(`${rowid}:${rowHash}\n`);
      }
      return { name: entry.name, rows, digest: digest.digest("hex") };
    });
    return { schema, schemaHash: hash(schema), tables };
  } finally { db.close(); }
}

/** Append new/changed rows, retaining every earlier version and rejecting source deletions. */
export async function syncLegacySnapshot(origin: Origin, file: string, apply: boolean) {
  const snapshot = readSnapshot(file);
  const counts = { origin, rows: snapshot.tables.reduce((n, table) => n + table.rows.length, 0), inserted: 0,
    tables: snapshot.tables.map(table => ({ table: table.name, rows: table.rows.length, sha256: table.digest })) };
  if (!apply) return counts;
  await sql.begin(async tx => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${`battery-legacy-sync:${origin}`}))`;
    const [schema] = await tx<{ schema_sha256: string }[]>`SELECT schema_sha256 FROM battery_legacy_schemas WHERE origin=${origin}`;
    if (schema && schema.schema_sha256 !== snapshot.schemaHash) throw new Error("SQLite schema changed; review a migration adapter before syncing");
    const archivedTables = await tx<{ table_name: string }[]>`SELECT DISTINCT table_name FROM battery_legacy_versions WHERE origin=${origin}`;
    if (archivedTables.some(row => !snapshot.tables.some(table => table.name === row.table_name))) throw new Error("Snapshot omits an archived table");
    await tx`INSERT INTO battery_legacy_schemas(origin,schema_json,schema_sha256)
      VALUES(${origin},${tx.json(snapshot.schema as never)},${snapshot.schemaHash}) ON CONFLICT DO NOTHING`;
    for (const table of snapshot.tables) {
      const old = await tx<{ sqlite_rowid: number; row_sha256: string; payload: Record<string, unknown> }[]>`
        SELECT DISTINCT ON(sqlite_rowid) sqlite_rowid,row_sha256,payload FROM battery_legacy_versions
        WHERE origin=${origin} AND table_name=${table.name} ORDER BY sqlite_rowid,id DESC`;
      const present = new Set(table.rows.map(row => row.rowid));
      if (old.some(row => !present.has(Number(row.sqlite_rowid)))) throw new Error(`Snapshot deletes rows from ${table.name}`);
      const previous = new Map(old.map(row => [Number(row.sqlite_rowid), row]));
      const changed = table.rows.filter(row => {
        const prior = previous.get(row.rowid);
        if (prior && prior.payload.id !== row.payload.id) throw new Error(`Snapshot reuses an ID at ${table.name}/${row.rowid}`);
        return prior?.row_sha256 !== row.hash;
      });
      for (let i = 0; i < changed.length; i += 500) {
        const batch = changed.slice(i, i + 500).map(row => ({ origin, table_name: table.name,
          sqlite_rowid: row.rowid, payload: tx.json(row.payload as never), row_sha256: row.hash }));
        const inserted = await tx`INSERT INTO battery_legacy_versions ${tx(batch)} RETURNING id`;
        counts.inserted += inserted.length;
      }
    }
  });
  return counts;
}

/** Reconstruct a separate SQLite file. This never merges into or overwrites a production database. */
export async function exportLegacySnapshot(origin: Origin, output: string) {
  const parent = realpathSync(path.dirname(output));
  const production = realpathSync(path.resolve(import.meta.dirname, "../../../../../battery_hot"));
  if (parent === production || parent.startsWith(`${production}${path.sep}`)) throw new Error("Export must be outside production");
  if (existsSync(output)) throw new Error("Export destination already exists");
  // Read one consistent PostgreSQL snapshot before creating the output.
  const snapshot = await sql.begin("isolation level repeatable read read only", async tx => {
    const [schema] = await tx<{ schema_json: SchemaEntry[]; schema_sha256: string }[]>`SELECT schema_json,schema_sha256 FROM battery_legacy_schemas WHERE origin=${origin}`;
    if (!schema || hash(schema.schema_json) !== schema.schema_sha256) throw new Error("Missing or corrupt archived SQLite schema");
    const rows = await tx<{ table_name: string; sqlite_rowid: number; payload: Record<string, unknown>; row_sha256: string }[]>`
      SELECT DISTINCT ON(table_name,sqlite_rowid) table_name,sqlite_rowid,payload,row_sha256
      FROM battery_legacy_versions WHERE origin=${origin} ORDER BY table_name,sqlite_rowid,id DESC`;
    for (const row of rows) if (hash(row.payload) !== row.row_sha256) throw new Error("Archived row hash mismatch");
    return { schema: schema.schema_json, rows };
  });
  closeSync(openSync(output, "wx", 0o600));
  const db = new DatabaseSync(output);
  try {
    db.exec("PRAGMA foreign_keys=OFF; BEGIN");
    for (const entry of snapshot.schema.filter(entry => entry.type === "table")) db.exec(entry.sql);
    for (const row of snapshot.rows) {
      const columns = Object.keys(row.payload);
      db.prepare(`INSERT INTO ${quote(row.table_name)}(rowid,${columns.map(quote).join(",")}) VALUES(${Array(columns.length + 1).fill("?").join(",")})`)
        .run(row.sqlite_rowid, ...columns.map(column => decoded(row.payload[column])));
    }
    for (const entry of snapshot.schema.filter(entry => entry.type !== "table")) db.exec(entry.sql);
    db.exec("COMMIT");
    if ((db.prepare("PRAGMA integrity_check").get() as { integrity_check: string }).integrity_check !== "ok") throw new Error("Export integrity check failed");
  } catch (error) {
    try { db.exec("ROLLBACK"); } catch { /* Verification can fail after commit; keep the file for diagnosis. */ }
    throw error;
  } finally { db.close(); }
  const verified = readSnapshot(output);
  if (verified.schemaHash !== hash(snapshot.schema)) throw new Error("Export schema mismatch");
  if (verified.tables.reduce((n, table) => n + table.rows.length, 0) !== snapshot.rows.length) throw new Error("Export row count mismatch");
  const hashes = new Map(snapshot.rows.map(row => [`${row.table_name}:${row.sqlite_rowid}`, row.row_sha256]));
  for (const table of verified.tables) for (const row of table.rows) {
    if (hashes.get(`${table.name}:${row.rowid}`) !== row.hash) throw new Error(`Export row mismatch at ${table.name}/${row.rowid}`);
  }
  return { origin, rows: snapshot.rows.length, output, integrity: "ok" };
}

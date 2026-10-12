-- The original archive remains immutable; changed/new snapshot rows are append-only versions.
CREATE TABLE battery_legacy_versions (
  id bigserial PRIMARY KEY,
  origin text NOT NULL CHECK (origin IN ('formal', 'signals')),
  table_name text NOT NULL,
  sqlite_rowid bigint NOT NULL,
  payload jsonb NOT NULL,
  row_sha256 text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO battery_legacy_versions(origin,table_name,sqlite_rowid,payload,row_sha256,captured_at)
  SELECT origin,table_name,sqlite_rowid,payload,row_sha256,imported_at FROM battery_legacy_rows;
CREATE INDEX battery_legacy_versions_latest_idx ON battery_legacy_versions(origin,table_name,sqlite_rowid,id DESC);
CREATE TABLE battery_legacy_schemas (
  origin text PRIMARY KEY CHECK (origin IN ('formal', 'signals')),
  schema_json jsonb NOT NULL,
  schema_sha256 text NOT NULL
);

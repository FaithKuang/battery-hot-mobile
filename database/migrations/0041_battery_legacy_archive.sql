-- Immutable, lossless staging for the old SQLite databases. No archived row is promoted by this table.
CREATE TABLE battery_legacy_rows (
  origin text NOT NULL CHECK (origin IN ('formal', 'signals')),
  table_name text NOT NULL,
  sqlite_rowid bigint NOT NULL,
  old_id text,
  payload jsonb NOT NULL,
  row_sha256 text NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (origin, table_name, sqlite_rowid)
);

CREATE INDEX battery_legacy_rows_old_id_idx ON battery_legacy_rows (origin, table_name, old_id)
  WHERE old_id IS NOT NULL;

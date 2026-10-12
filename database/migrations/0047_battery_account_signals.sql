-- Isolated community metadata, never articles/publications or selected/report input.
CREATE TABLE battery_account_signals (
  account_id text NOT NULL,
  post_id text NOT NULL,
  url text NOT NULL UNIQUE,
  title text NOT NULL,
  excerpt text NOT NULL CHECK (length(excerpt) <= 180),
  companies text[] NOT NULL,
  topic text NOT NULL CHECK (topic IN ('bbu', 'cbu', 'backup-power')),
  published_at timestamptz NOT NULL,
  discovered_at timestamptz NOT NULL DEFAULT now(),
  checked_at timestamptz NOT NULL,
  content_hash text NOT NULL,
  PRIMARY KEY (account_id, post_id)
);
CREATE INDEX battery_account_signals_time ON battery_account_signals(published_at DESC);
CREATE TABLE battery_account_checks (
  account_id text PRIMARY KEY,
  day_key date NOT NULL,
  checked_at timestamptz NOT NULL,
  last_ok_at timestamptz,
  result jsonb NOT NULL
);

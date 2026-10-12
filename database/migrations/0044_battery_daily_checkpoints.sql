CREATE TABLE battery_daily_sources (
  day_key date NOT NULL,
  source_id text NOT NULL REFERENCES sources(id),
  result jsonb NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day_key, source_id)
);

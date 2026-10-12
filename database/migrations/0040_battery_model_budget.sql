CREATE TABLE battery_model_attempts (
  id text PRIMARY KEY,
  round_id text NOT NULL,
  day_key date NOT NULL,
  article_id text NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  reserved_nano_usd bigint NOT NULL CHECK (reserved_nano_usd >= 0),
  charged_nano_usd bigint NOT NULL DEFAULT 0 CHECK (charged_nano_usd >= 0),
  state text NOT NULL CHECK (state IN ('pending', 'unknown', 'complete', 'declined')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX battery_model_attempts_day_idx ON battery_model_attempts(day_key, state);

CREATE TABLE battery_model_rounds (
  id text PRIMARY KEY,
  disabled_reason text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Trace every old formal ID to the new projection without using a model or granting selection.
CREATE TABLE battery_legacy_article_ids (
  old_id text PRIMARY KEY,
  article_id text NOT NULL REFERENCES articles(id)
);

CREATE TABLE battery_legacy_event_ids (
  old_id text PRIMARY KEY,
  story_id bigint NOT NULL REFERENCES stories(id),
  fact_id bigint NOT NULL REFERENCES facts(id)
);

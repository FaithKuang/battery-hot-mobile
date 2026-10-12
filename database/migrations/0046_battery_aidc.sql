-- Internal scope metadata; no body archive or editorial qualification is added.
ALTER TABLE publications ADD COLUMN aidc_priority smallint NOT NULL DEFAULT 0 CHECK (aidc_priority BETWEEN 0 AND 2);
ALTER TABLE publications ADD COLUMN aidc_companies text[] NOT NULL DEFAULT '{}';
CREATE INDEX publications_aidc_time ON publications (aidc_priority, published_at DESC, article_id DESC)
  WHERE eligible AND visibility = 'public' AND aidc_priority > 0;

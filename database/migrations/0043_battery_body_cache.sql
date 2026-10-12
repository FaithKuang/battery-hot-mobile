-- Cache expiry is separate from article revision and publication evidence.
ALTER TABLE articles ADD COLUMN body_cached_at timestamptz;
UPDATE articles SET body_cached_at = updated_at WHERE body_text IS NOT NULL OR body_html IS NOT NULL;
CREATE FUNCTION mark_article_body_cache() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.body_text IS DISTINCT FROM OLD.body_text OR NEW.body_html IS DISTINCT FROM OLD.body_html THEN
    NEW.body_cached_at := CASE WHEN NEW.body_text IS NOT NULL OR NEW.body_html IS NOT NULL THEN now() ELSE NULL END;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER article_body_cache_clock BEFORE INSERT OR UPDATE ON articles
FOR EACH ROW EXECUTE FUNCTION mark_article_body_cache();

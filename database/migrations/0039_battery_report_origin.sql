ALTER TABLE reports DROP CONSTRAINT reports_origin_check;
ALTER TABLE reports ADD CONSTRAINT reports_origin_check CHECK (origin IN ('model', 'imported', 'manual', 'rule'));

-- Technical reading priority is separate from BBU evidence and editorial selection.
ALTER TABLE publications DROP CONSTRAINT publications_aidc_priority_check;
ALTER TABLE publications ADD CONSTRAINT publications_aidc_priority_check CHECK (aidc_priority BETWEEN 0 AND 3);

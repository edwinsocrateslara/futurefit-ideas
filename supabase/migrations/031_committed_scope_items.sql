-- Atomic: column type changes + data migration in one transaction.
-- ideas.committed_scope and jira_links.snapshot_committed_scope go from TEXT → JSONB.
-- The one existing row is migrated from a numbered-list string to a parsed 5-item array.
-- All NULL rows remain NULL. Any other TEXT rows are wrapped as single-item arrays.

BEGIN;

ALTER TABLE ideas
  ALTER COLUMN committed_scope TYPE JSONB
  USING CASE
    WHEN committed_scope IS NULL THEN NULL
    ELSE jsonb_build_array(committed_scope)
  END;

-- Migrate the existing numbered-list string to the correct 5-item parsed array
UPDATE ideas
SET committed_scope = '["event capture in platform","discovery: tying relevant events to policy and CA program mapping and where we are the source of truth","job placement data at scale","wage data available through FFAI (though not origin point for wage data)","training program enrollment & completion data at scale"]'::jsonb
WHERE canny_id = '6a024b2c123063d14c412c87';

ALTER TABLE jira_links
  ALTER COLUMN snapshot_committed_scope TYPE JSONB
  USING CASE
    WHEN snapshot_committed_scope IS NULL THEN NULL
    ELSE jsonb_build_array(snapshot_committed_scope)
  END;

COMMIT;

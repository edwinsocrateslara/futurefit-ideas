-- Make badge-related columns nullable so synthesis no longer needs to write them.
-- selection_status on ideas was already nullable (TEXT with no NOT NULL constraint).
-- board_count, item_count, roadmap_alignment on patterns were NOT NULL — relax them.
ALTER TABLE patterns ALTER COLUMN board_count DROP NOT NULL;
ALTER TABLE patterns ALTER COLUMN item_count DROP NOT NULL;
ALTER TABLE patterns ALTER COLUMN roadmap_alignment DROP NOT NULL;

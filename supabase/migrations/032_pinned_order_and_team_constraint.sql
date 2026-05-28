-- 1. Add pin_sort_order for manual drag-to-reorder on the Pinned/Coming Up list.
--    NULL = unordered (falls back to pinned_at). Server writes integer positions on reorder.
ALTER TABLE public.ideas
  ADD COLUMN pin_sort_order INT NULL;

-- 2. Widen manual_team_classification CHECK constraint to allow 'Engineering & Data'.
--    Synthesis never writes this value (it only uses TEAM_CLASSIFICATION_VALUES which excludes it).
--    Only manual user overrides can set it, and they survive synthesis runs via the dual-column pattern.
ALTER TABLE public.ideas
  DROP CONSTRAINT ideas_manual_team_classification_check,
  ADD CONSTRAINT ideas_manual_team_classification_check
  CHECK (manual_team_classification IN ('Engineering', 'Data', 'Engineering & Data'));

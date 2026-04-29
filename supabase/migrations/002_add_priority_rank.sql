-- Add priority rank to ideas so the dashboard can order selections without
-- hitting the prompt_runs JSONB blob.
ALTER TABLE ideas ADD COLUMN IF NOT EXISTS selection_priority_rank INTEGER;

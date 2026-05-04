-- Selections history table: one row per item per week it appears in top 10
CREATE TABLE selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canny_id TEXT NOT NULL REFERENCES ideas(canny_id),
  week_of DATE NOT NULL,
  priority_rank INTEGER NOT NULL CHECK (priority_rank BETWEEN 1 AND 10),
  reason TEXT NOT NULL,
  jira_story TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (canny_id, week_of)
);

CREATE INDEX selections_canny_id_idx ON selections(canny_id);
CREATE INDEX selections_week_of_idx ON selections(week_of);

-- Pattern lineage: patterns sharing a lineage_id are the same recurring theme
ALTER TABLE patterns ADD COLUMN IF NOT EXISTS pattern_lineage_id UUID;
CREATE INDEX patterns_lineage_id_idx ON patterns(pattern_lineage_id) WHERE pattern_lineage_id IS NOT NULL;

-- Backfill selections from stored prompt_runs output
-- EXISTS guard skips any canny_ids removed from ideas since that run
INSERT INTO selections (canny_id, week_of, priority_rank, reason, jira_story, created_at)
SELECT
  sel->>'canny_id',
  (output->>'week_of')::DATE,
  (sel->>'priority_rank')::INTEGER,
  sel->>'reason',
  sel->>'jira_story',
  pr.created_at
FROM prompt_runs pr,
  jsonb_array_elements(pr.output->'selections') AS sel
WHERE pr.error IS NULL
  AND pr.output IS NOT NULL
  AND pr.output ? 'selections'
  AND EXISTS (SELECT 1 FROM ideas WHERE canny_id = sel->>'canny_id')
ON CONFLICT (canny_id, week_of) DO NOTHING;

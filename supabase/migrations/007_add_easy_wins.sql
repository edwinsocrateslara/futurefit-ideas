CREATE TABLE easy_wins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canny_id TEXT NOT NULL REFERENCES ideas(canny_id),
  week_of DATE NOT NULL,
  reason TEXT NOT NULL,
  effort_estimate TEXT NOT NULL CHECK (effort_estimate IN ('trivial', 'small', 'medium')),
  jira_story TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (canny_id, week_of)
);

CREATE INDEX easy_wins_canny_id_idx ON easy_wins(canny_id);
CREATE INDEX easy_wins_week_of_idx ON easy_wins(week_of);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.easy_wins TO service_role;
GRANT SELECT ON public.easy_wins TO anon;
GRANT SELECT ON public.easy_wins TO authenticated;

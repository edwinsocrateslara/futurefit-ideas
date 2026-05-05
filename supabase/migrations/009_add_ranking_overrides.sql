CREATE TABLE ranking_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canny_id TEXT NOT NULL REFERENCES ideas(canny_id),
  week_of DATE NOT NULL,
  original_rank INTEGER NOT NULL CHECK (original_rank BETWEEN 1 AND 10),
  new_rank INTEGER NOT NULL CHECK (new_rank BETWEEN 1 AND 10),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (canny_id, week_of)
);

CREATE INDEX ranking_overrides_week_of_idx ON ranking_overrides(week_of);
CREATE INDEX ranking_overrides_canny_id_idx ON ranking_overrides(canny_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ranking_overrides TO service_role;
GRANT SELECT ON public.ranking_overrides TO anon;
GRANT SELECT ON public.ranking_overrides TO authenticated;

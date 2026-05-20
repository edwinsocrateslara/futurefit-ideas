CREATE TABLE quick_win_proposals (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  canny_id    TEXT         NOT NULL REFERENCES ideas(canny_id) ON DELETE CASCADE,
  comment     TEXT         NULL CHECK (char_length(comment) <= 2000),
  status      TEXT         NOT NULL CHECK (status IN ('pending', 'added', 'rejected')) DEFAULT 'pending',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_quick_win_proposals_status ON quick_win_proposals(status);

-- UPDATE only — rows are never deleted, only status-transitioned
GRANT SELECT, INSERT, UPDATE ON public.quick_win_proposals TO anon, authenticated, service_role;

-- ============================================================
-- jira_links: Jira tickets created from synthesized ideas
-- ============================================================
--
-- Derived item states (computed at query time, never stored):
--   Surfaced  — no jira_links row, ideas.marked_done = false
--   Accepted  — jira_links row exists, done_at IS NULL
--   Deferred  — ideas.marked_done = true  (was "Done" — UI rename only)
--   Done      — jira_links row exists, done_at IS NOT NULL
-- ============================================================

CREATE TABLE jira_links (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canny_id       TEXT NOT NULL REFERENCES ideas(canny_id),
  jira_issue_key TEXT NOT NULL,        -- e.g. FFAI-42
  jira_issue_id  TEXT NOT NULL,        -- Jira internal numeric ID
  jira_url       TEXT NOT NULL,        -- https://yoursite.atlassian.net/browse/FFAI-42
  jira_status    TEXT NOT NULL,        -- raw status string from Jira
  accepted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,          -- last time we polled Jira for status
  done_at        TIMESTAMPTZ,          -- set when jira_status hits a done-equivalent
  UNIQUE (canny_id)                    -- one active Jira ticket per idea (v1)
);

CREATE INDEX jira_links_canny_id_idx ON jira_links(canny_id);
CREATE INDEX jira_links_active_idx ON jira_links(done_at) WHERE done_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.jira_links TO service_role;
GRANT SELECT ON public.jira_links TO anon;
GRANT SELECT ON public.jira_links TO authenticated;

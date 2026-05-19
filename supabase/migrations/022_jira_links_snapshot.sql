-- ============================================================
-- Snapshot synthesis metadata onto jira_links at accept time.
--
-- Accepted items are human decisions. The synthesis reset wipes
-- selection_reason and callout fields on ALL ideas rows each run,
-- so Accepted cards must carry their own frozen copy of the reason
-- and metadata that was current when the item was accepted.
--
-- dashboard.ts reads snapshot_reason first, falling back to the
-- live easy_wins / ideas logic when null (covers rows created
-- before this migration).
-- ============================================================

ALTER TABLE jira_links
  ADD COLUMN snapshot_reason                TEXT,
  ADD COLUMN snapshot_why_callout           TEXT,
  ADD COLUMN snapshot_customers_callout     TEXT,
  ADD COLUMN snapshot_deadline_callout      TEXT,
  ADD COLUMN snapshot_impact_rating         SMALLINT,
  ADD COLUMN snapshot_confidence_rating     SMALLINT,
  ADD COLUMN snapshot_team_classification   TEXT,
  ADD COLUMN snapshot_status               TEXT;

ALTER TABLE ideas
  ADD COLUMN committed_scope TEXT NULL;

ALTER TABLE jira_links
  ADD COLUMN snapshot_committed_scope TEXT NULL;

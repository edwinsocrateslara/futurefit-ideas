ALTER TABLE ideas
  ADD COLUMN pinned_from TEXT NULL
    CHECK (pinned_from IN ('top_10', 'quick_win'));

-- Backfill: all currently-pinned items came from Top 10 (Easy Wins pinning didn't exist yet)
UPDATE ideas SET pinned_from = 'top_10' WHERE pinned_at IS NOT NULL;

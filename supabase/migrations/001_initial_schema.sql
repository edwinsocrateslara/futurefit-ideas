-- ============================================================
-- FutureFit Ideas Dashboard — Initial Schema
-- ============================================================

-- Boards: one row per Canny board, seeded from config/boards.ts
CREATE TABLE boards (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canny_id     TEXT UNIQUE NOT NULL,
  slug         TEXT UNIQUE NOT NULL,
  name         TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ideas: one row per Canny post
CREATE TABLE ideas (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canny_id           TEXT UNIQUE NOT NULL,
  board_id           UUID NOT NULL REFERENCES boards(id),
  title              TEXT NOT NULL,
  description        TEXT,
  vote_count         INTEGER NOT NULL DEFAULT 0,
  canny_url          TEXT,
  created_at         TIMESTAMPTZ NOT NULL,
  removed_at         TIMESTAMPTZ,       -- soft delete when gone from Canny
  -- Claude selection metadata
  selected_this_week BOOLEAN NOT NULL DEFAULT FALSE,
  selection_reason   TEXT,
  selection_status   TEXT,              -- status badge enum value
  selection_week     DATE,              -- Monday of the week selected (YYYY-MM-DD)
  -- housekeeping
  synced_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tags: Canny tags normalized
CREATE TABLE tags (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- idea_tags: many-to-many join
CREATE TABLE idea_tags (
  idea_id UUID NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
  tag_id  UUID NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
  PRIMARY KEY (idea_id, tag_id)
);

-- Patterns: cross-board themes detected by Claude per week
CREATE TABLE patterns (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_of           DATE NOT NULL,      -- Monday of the synthesis week
  title             TEXT NOT NULL,
  summary           TEXT NOT NULL,
  board_count       INTEGER NOT NULL,
  item_count        INTEGER NOT NULL,
  roadmap_alignment TEXT NOT NULL,      -- 'no_match' | 'partial_overlap' | 'aligned' | 'contradicts'
  angles            JSONB NOT NULL,     -- { framing: string, questions: string[] }
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- pattern_items: many-to-many join linking patterns to supporting ideas
CREATE TABLE pattern_items (
  pattern_id UUID NOT NULL REFERENCES patterns(id) ON DELETE CASCADE,
  idea_id    UUID NOT NULL REFERENCES ideas(id)    ON DELETE CASCADE,
  PRIMARY KEY (pattern_id, idea_id)
);

-- sync_runs: audit log for each Monday cron execution
CREATE TABLE sync_runs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at      TIMESTAMPTZ NOT NULL,
  completed_at    TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'running', -- 'running' | 'completed' | 'failed'
  items_processed INTEGER NOT NULL DEFAULT 0,
  items_added     INTEGER NOT NULL DEFAULT 0,
  items_updated   INTEGER NOT NULL DEFAULT 0,
  items_removed   INTEGER NOT NULL DEFAULT 0,
  week_of         DATE,   -- Monday of the week this run covers
  error           TEXT
);

-- prompt_runs: log every Claude synthesis call for prompt iteration
CREATE TABLE prompt_runs (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_run_id         UUID REFERENCES sync_runs(id),
  prompt_version      TEXT NOT NULL,
  model               TEXT NOT NULL,
  duration_ms         INTEGER,
  input_item_count    INTEGER NOT NULL,
  output              JSONB,
  error               TEXT,
  strategy_commit_sha TEXT,   -- git SHA of strategy docs at time of run
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX idx_ideas_board_id        ON ideas(board_id);
CREATE INDEX idx_ideas_created_at      ON ideas(created_at);
CREATE INDEX idx_ideas_selection_week  ON ideas(selection_week);
CREATE INDEX idx_ideas_selected        ON ideas(selected_this_week) WHERE selected_this_week = TRUE;
CREATE INDEX idx_ideas_active          ON ideas(removed_at) WHERE removed_at IS NULL;
CREATE INDEX idx_patterns_week_of      ON patterns(week_of);
CREATE INDEX idx_sync_runs_status      ON sync_runs(status);
CREATE INDEX idx_sync_runs_started_at  ON sync_runs(started_at DESC);
CREATE INDEX idx_prompt_runs_created   ON prompt_runs(created_at DESC);

-- ============================================================
-- Seed: board registry (matches config/boards.ts)
-- Update canny_id values to match your actual Canny board IDs
-- ============================================================

INSERT INTO boards (canny_id, slug, name, display_order) VALUES
  ('69dd91a6101dd51b00677e0c', 'customer-ideas',   'Customer Ideas',      0),
  ('69dd91d2eef3251ac9c41091', 'market-ideas',     'Market Opportunities', 1),
  ('69dd91e37587ef995a08ef54', 'ux-inspiration',   'UI/UX Inspiration',   2),
  ('670c2bce89df784b49c2252e', 'platform-feedback','FutureFit AI',        3);

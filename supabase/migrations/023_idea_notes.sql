CREATE TABLE idea_notes (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  canny_id    TEXT        NOT NULL REFERENCES ideas(canny_id) ON DELETE CASCADE,
  note_text   TEXT        NOT NULL CHECK (char_length(note_text) <= 2000),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_idea_notes_canny_id ON idea_notes(canny_id);

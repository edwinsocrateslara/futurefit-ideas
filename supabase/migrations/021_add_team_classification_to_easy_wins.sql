ALTER TABLE easy_wins
  ADD COLUMN team_classification TEXT CHECK (team_classification IN ('Engineering', 'Data'));

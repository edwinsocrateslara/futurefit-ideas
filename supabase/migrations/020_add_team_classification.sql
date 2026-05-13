ALTER TABLE ideas
  ADD COLUMN team_classification        TEXT CHECK (team_classification        IN ('Engineering', 'Data')),
  ADD COLUMN manual_team_classification TEXT CHECK (manual_team_classification IN ('Engineering', 'Data'));

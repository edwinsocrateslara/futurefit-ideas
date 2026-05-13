ALTER TABLE ideas
  ADD COLUMN impact_score        INTEGER CHECK (impact_score IN (1,2,3,4,5)),
  ADD COLUMN manual_impact_score INTEGER CHECK (manual_impact_score IN (1,2,3,4,5));

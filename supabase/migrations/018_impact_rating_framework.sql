-- Drop the 1-5 composite score from 017 — all scored values clustered at 4-5,
-- unusable for differentiation. Replacing with a two-dimensional framework
-- where impact_rating × confidence_rating gives a 1-16 range.
ALTER TABLE ideas
  DROP COLUMN IF EXISTS impact_score,
  DROP COLUMN IF EXISTS manual_impact_score;

ALTER TABLE ideas
  ADD COLUMN impact_rating             INTEGER CHECK (impact_rating             IN (1,2,3,4)),
  ADD COLUMN manual_impact_rating      INTEGER CHECK (manual_impact_rating      IN (1,2,3,4)),
  ADD COLUMN confidence_rating         INTEGER CHECK (confidence_rating         IN (1,2,3,4)),
  ADD COLUMN manual_confidence_rating  INTEGER CHECK (manual_confidence_rating  IN (1,2,3,4));

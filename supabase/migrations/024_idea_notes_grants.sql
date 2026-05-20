-- idea_notes was created in 023 without explicit grants, mirroring the same
-- pattern that broke selections (see 015_grant_selections_access.sql).
-- service_role bypasses RLS but still needs explicit GRANT on new tables.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.idea_notes TO anon, authenticated, service_role;

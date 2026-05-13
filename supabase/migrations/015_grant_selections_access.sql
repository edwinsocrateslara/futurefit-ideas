-- selections table was created in 006 without explicit grants, causing
-- permission denied errors when the dashboard queries selection history.
-- This silently broke the "New This Week" and "Persistent" counters
-- (weeksByCanny always returned empty, so every item appeared as week 1).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.selections TO service_role;

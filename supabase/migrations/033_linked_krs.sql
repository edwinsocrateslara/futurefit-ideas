-- KR linkage: synthesis-assigned + manual override, dual-column pattern
-- linked_krs: cleared and rewritten by synthesis each run
-- manual_linked_krs: human override, never touched by synthesis, persists across runs
ALTER TABLE public.ideas
  ADD COLUMN linked_krs        TEXT[] NULL,
  ADD COLUMN manual_linked_krs TEXT[] NULL;

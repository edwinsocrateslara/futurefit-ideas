import { z } from "zod";

// ── Building blocks ───────────────────────────────────────────────────────────

export const AnglesSchema = z.object({
  framing: z.string().min(1),
  possibilities: z.array(z.string().min(1)).min(3).max(5),
});

// Flat selection — canny_id, rank, dashboard title, and strategic reason
export const SelectionSchema = z.object({
  canny_id: z.string(),
  priority_rank: z.number().int().min(1).max(10),
  title: z.string().min(1),
  reason: z.string().min(1),
  jira_story: z.string().min(1),
});

// Pattern — title, summary, linked evidence, lineage tag, exploration angles
export const PatternSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  linked_canny_ids: z.array(z.string()).min(2),
  pattern_lineage_id: z.string().uuid().nullable(),
  angles: AnglesSchema,
});

// Easy win — shippable in a sprint, solution obvious from feedback
export const EasyWinSchema = z.object({
  canny_id: z.string().min(1),
  title: z.string().min(1),
  reason: z.string().min(1),
  jira_story: z.string().min(1),
});

// ── Top-level output ──────────────────────────────────────────────────────────

export const SynthesisOutputSchema = z.object({
  week_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  prompt_version: z.string(),
  selections: z.array(SelectionSchema).length(10),
  patterns: z.array(PatternSchema),
  easy_wins: z.array(EasyWinSchema).length(5),
});

// ── Inferred types ────────────────────────────────────────────────────────────

export type SynthesisOutput = z.infer<typeof SynthesisOutputSchema>;
export type Selection = z.infer<typeof SelectionSchema>;
export type Pattern = z.infer<typeof PatternSchema>;
export type EasyWin = z.infer<typeof EasyWinSchema>;

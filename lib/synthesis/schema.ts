import { z } from "zod";

// ── Building blocks ───────────────────────────────────────────────────────────

export const AnglesSchema = z.object({
  framing: z.string().min(1),
  possibilities: z.array(z.string().min(1)).min(3).max(5),
});

// Flat selection — canny_id, rank, and strategic reason only
export const SelectionSchema = z.object({
  canny_id: z.string(),
  priority_rank: z.number().int().min(1).max(10),
  reason: z.string().min(1),
});

// Pattern — title, summary, linked evidence, exploration angles
export const PatternSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  linked_canny_ids: z.array(z.string()).min(2),
  angles: AnglesSchema,
});

// ── Top-level output ──────────────────────────────────────────────────────────

export const SynthesisOutputSchema = z.object({
  week_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  prompt_version: z.string(),
  selections: z.array(SelectionSchema).length(10),
  patterns: z.array(PatternSchema),
});

// ── Inferred types ────────────────────────────────────────────────────────────

export type SynthesisOutput = z.infer<typeof SynthesisOutputSchema>;
export type Selection = z.infer<typeof SelectionSchema>;
export type Pattern = z.infer<typeof PatternSchema>;

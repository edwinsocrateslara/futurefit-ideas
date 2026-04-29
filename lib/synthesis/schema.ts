import { z } from "zod";

// ── Enums ─────────────────────────────────────────────────────────────────────

export const StatusBadgeSchema = z.enum([
  "gap",
  "on_roadmap",
  "aligned",
  "watch",
  "new",
  "in_flight",
  "critical",
]);

export const RoadmapAlignmentSchema = z.enum([
  "no_match",
  "partial_overlap",
  "aligned",
  "contradicts",
]);

export const BoardScopeSchema = z.enum([
  "single-board",
  "cross-board",
]);

// ── Building blocks ───────────────────────────────────────────────────────────

export const AnglesSchema = z.object({
  framing: z.string().min(1),
  questions: z.array(z.string().min(1)).min(3).max(5),
  possibilities: z.array(z.string().min(1)).min(3).max(5),
});

// Flat selection — board_slug and priority_rank on every item
// Presentation layer decides how to group or order
export const SelectionSchema = z.object({
  canny_id: z.string(),
  priority_rank: z.number().int().min(1).max(10),
  reason: z.string().min(1),
  status_badge: StatusBadgeSchema,
});

// ── Patterns ──────────────────────────────────────────────────────────────────

export const PatternSchema = z.object({
  title: z.string().min(1),
  summary: z.string().min(1),
  board_scope: BoardScopeSchema,
  board_count: z.number().int().min(1),
  item_count: z.number().int().min(2),
  roadmap_alignment: RoadmapAlignmentSchema,
  linked_canny_ids: z.array(z.string()).min(2),
  angles: AnglesSchema,
});

// ── Top-level output ──────────────────────────────────────────────────────────

export const SynthesisOutputSchema = z.object({
  week_of: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  prompt_version: z.string(),

  // Flat ranked list of 10 selections across all boards
  selections: z.array(SelectionSchema).length(10),

  // Flat pattern list — board_scope makes single vs. cross-board explicit
  patterns: z.array(PatternSchema),
});

// ── Inferred types ────────────────────────────────────────────────────────────

export type SynthesisOutput = z.infer<typeof SynthesisOutputSchema>;
export type Selection = z.infer<typeof SelectionSchema>;
export type Pattern = z.infer<typeof PatternSchema>;
export type StatusBadge = z.infer<typeof StatusBadgeSchema>;
export type RoadmapAlignment = z.infer<typeof RoadmapAlignmentSchema>;
export type BoardScope = z.infer<typeof BoardScopeSchema>;



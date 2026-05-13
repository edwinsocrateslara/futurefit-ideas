import { z } from "zod";

// ── Canonical metadata values (single source of truth for prompt + UI) ───────

export const STATUS_VALUES = [
  "Contractual Requirement",
  "Renewal Risk",
  "Strategic",
  "Need to Do",
] as const;
export type StatusValue = typeof STATUS_VALUES[number];

export const IMPACT_RATING_VALUES = [1, 2, 3, 4] as const;
export type ImpactRating = typeof IMPACT_RATING_VALUES[number];

export const CONFIDENCE_RATING_VALUES = [1, 2, 3, 4] as const;
export type ConfidenceRating = typeof CONFIDENCE_RATING_VALUES[number];

export const TEAM_CLASSIFICATION_VALUES = ["Engineering", "Data"] as const;
export type TeamClassification = typeof TEAM_CLASSIFICATION_VALUES[number];

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
  status: z.enum(STATUS_VALUES),
  impact_rating: z.number().int().min(1).max(4),
  confidence_rating: z.number().int().min(1).max(4),
  why_callout: z.string().nullable(),
  customers_prospects_callout: z.string().nullable(),
  hard_deadline_notes_callout: z.string().nullable(),
  team_classification: z.enum(TEAM_CLASSIFICATION_VALUES),
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

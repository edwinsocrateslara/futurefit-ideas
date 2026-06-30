import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { createServiceClient } from "@/lib/supabase/server";
import { BOARDS } from "@/config/boards";
import { SynthesisOutputSchema } from "./schema";
import {
  buildSystemMessage,
  buildUserMessage,
  buildStrategyDocsString,
  PROMPT_VERSION,
} from "./prompt";
import type { BoardGroup, IdeaInput, OverrideSignal, PreviousPattern } from "./prompt";
import type { SynthesisOutput } from "./schema";

const MODEL = "claude-sonnet-4-6";
const TEMPERATURE = 0.3;
const STRATEGY_DIR = join(process.cwd(), "strategy");

// Curated boards are always included in full — items appear there because a human
// deliberately added them. platform-feedback is high-volume; cap it by vote rank to
// control prompt size as the pool grows.
const PLATFORM_FEEDBACK_CAP = 100;

const CLAUDE_MAX_RETRIES = 3;
const CLAUDE_RETRY_DELAYS_MS = [5_000, 10_000]; // delay before attempt 2, then attempt 3


function loadStrategyDocs(): Record<string, string> {
  const docs: Record<string, string> = {};
  const filenames = [
    "okrs.md",
    "product-diagnosis.md",
    "build-strategy.md",
    "futurefit-north-star.md",
    "north-star-strategy-memo.md",
    "futurefit-architecture-reference.md",
  ];

  for (const filename of filenames) {
    const filepath = join(STRATEGY_DIR, filename);
    if (existsSync(filepath)) {
      docs[filename] = readFileSync(filepath, "utf-8");
    } else {
      console.warn(`Strategy doc not found: ${filepath}`);
    }
  }

  if (Object.keys(docs).length === 0) {
    throw new Error(
      "No strategy docs found in /strategy. Add roadmap.md, okrs.md, or product-strategy.md."
    );
  }

  return docs;
}

function getStrategyCommitSha(): string {
  return process.env.VERCEL_GIT_COMMIT_SHA ?? "local";
}

export async function runSynthesis(
  syncRunId: string,
  weekOf: string // YYYY-MM-DD Monday
): Promise<SynthesisOutput> {
  const supabase = createServiceClient();
  const client = new Anthropic();
  const startedAt = Date.now();

  // Verify sync completed successfully before proceeding
  const { data: syncRun } = await supabase
    .from("sync_runs")
    .select("status, week_of")
    .eq("id", syncRunId)
    .single();

  if (!syncRun || syncRun.status !== "completed") {
    throw new Error(
      `Synthesis aborted: sync_run ${syncRunId} has status '${syncRun?.status ?? "not found"}' — must be 'completed'`
    );
  }

  const weekMonday = new Date(weekOf + "T00:00:00Z");

  // Resolve board IDs so we can split curated boards from platform-feedback
  const { data: boardRows } = await supabase.from("boards").select("id, slug");
  const boardIdBySlug = Object.fromEntries((boardRows ?? []).map((b) => [b.slug, b.id]));
  const platformFeedbackId = boardIdBySlug["platform-feedback"];
  const curatedBoardIds = ["customer-ideas", "market-ideas", "ux-inspiration"]
    .map((slug) => boardIdBySlug[slug])
    .filter(Boolean);

  const sharedSelect = "canny_id, title, description, vote_count, board_id, created_at, boards(slug, name)";

  // Curated boards: always include all items — they were deliberately added by humans
  const { data: curatedIdeas, error: curatedError } = await supabase
    .from("ideas")
    .select(sharedSelect)
    .is("removed_at", null)
    .is("pinned_at", null)
    .in("board_id", curatedBoardIds)
    .order("vote_count", { ascending: false });

  if (curatedError) throw new Error(`Failed to fetch curated ideas: ${curatedError.message}`);

  // platform-feedback: high-volume board — cap at top N by vote count to control prompt size
  const { data: platformIdeas, error: platformError } = await supabase
    .from("ideas")
    .select(sharedSelect)
    .is("removed_at", null)
    .is("pinned_at", null)
    .eq("board_id", platformFeedbackId)
    .order("vote_count", { ascending: false })
    .limit(PLATFORM_FEEDBACK_CAP);

  if (platformError) throw new Error(`Failed to fetch platform-feedback ideas: ${platformError.message}`);

  const weekIdeas = [...(curatedIdeas ?? []), ...(platformIdeas ?? [])];
  const ideasError = null; // kept for downstream compat check below

  if (!weekIdeas || weekIdeas.length === 0) {
    throw new Error(`No ideas found. Cannot run synthesis.`);
  }

  // Group ideas by board
  const boardGroups: BoardGroup[] = BOARDS.map((boardConfig) => ({
    slug: boardConfig.slug,
    name: boardConfig.name,
    ideas: weekIdeas
      .filter((idea) => {
        const board = idea.boards as unknown as { slug: string; name: string } | null;
        return board?.slug === boardConfig.slug;
      })
      .map((idea): IdeaInput => {
        const board = idea.boards as unknown as { slug: string; name: string };
        return {
          canny_id: idea.canny_id,
          title: idea.title,
          description: idea.description,
          board_slug: board.slug as IdeaInput["board_slug"],
          board_name: board.name,
          created_at: idea.created_at,
        };
      }),
  })).filter((g) => g.ideas.length > 0);

  const totalItems = boardGroups.reduce((n, g) => n + g.ideas.length, 0);

  // Load strategy docs from disk — split architecture reference into a separate string
  // so it can be injected contextually before TASK 3 rather than in the main strategy block
  const allDocs = loadStrategyDocs();
  const { "futurefit-architecture-reference.md": archContent, ...strategyOnlyDocs } = allDocs;
  const strategyString = buildStrategyDocsString(strategyOnlyDocs);
  const architectureString = archContent
    ? buildStrategyDocsString({ "futurefit-architecture-reference.md": archContent })
    : "";

  // Fetch last 4 weeks of patterns for lineage context
  const fourWeeksAgo = new Date(weekMonday);
  fourWeeksAgo.setUTCDate(fourWeeksAgo.getUTCDate() - 28);
  const { data: prevPatternRows } = await supabase
    .from("patterns")
    .select("week_of, title, summary, pattern_lineage_id")
    .lt("week_of", weekOf)
    .gte("week_of", fourWeeksAgo.toISOString().slice(0, 10))
    .not("pattern_lineage_id", "is", null)
    .order("week_of", { ascending: false });

  const previousPatterns: PreviousPattern[] = (prevPatternRows ?? [])
    .filter((p) => p.pattern_lineage_id)
    .map((p) => ({
      week_of: p.week_of,
      title: p.title,
      summary: p.summary,
      pattern_lineage_id: p.pattern_lineage_id!,
    }));

  // Fetch ranking override signals from last 4 weeks
  const { data: overrideHistoryRows } = await supabase
    .from("ranking_overrides")
    .select("canny_id, original_rank, new_rank, week_of, ideas(title)")
    .lt("week_of", weekOf)
    .gte("week_of", fourWeeksAgo.toISOString().slice(0, 10));

  const overrideSignals: OverrideSignal[] = (overrideHistoryRows ?? []).map((row) => {
    const idea = row.ideas as unknown as { title: string } | null;
    return {
      title: idea?.title ?? row.canny_id,
      moved_up: row.new_rank < row.original_rank,
      week_of: row.week_of,
    };
  });

  // Build prompt
  const systemMessage = buildSystemMessage();
  const userMessage = buildUserMessage(boardGroups, strategyString, weekOf, previousPatterns, overrideSignals, architectureString);

  console.log(`[synthesis] Pool: ${totalItems} items (${curatedIdeas?.length ?? 0} curated, ${platformIdeas?.length ?? 0} platform-feedback)`);

  // Call Claude — retry on 429/529 (overloaded), log and re-throw on other errors
  let rawOutput: string | null = null;
  let claudeError: Error | null = null;

  for (let attempt = 0; attempt < CLAUDE_MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = CLAUDE_RETRY_DELAYS_MS[attempt - 1] ?? 10_000;
      console.log(`[synthesis] Claude attempt ${attempt + 1}/${CLAUDE_MAX_RETRIES} — waiting ${delay}ms (${claudeError?.message})`);
      await new Promise((r) => setTimeout(r, delay));
    }

    try {
      const message = await client.messages.create({
        model: MODEL,
        max_tokens: 16000,
        temperature: TEMPERATURE,
        // Cache the system message — it is constant across all synthesis runs.
        // Saves re-tokenizing ~2K tokens on retries within the 5-min cache TTL.
        system: [{ type: "text", text: systemMessage, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: userMessage }],
      });

      const block = message.content[0];
      if (block.type !== "text") throw new Error("Claude returned a non-text response block");
      rawOutput = block.text;
      claudeError = null;
      break;
    } catch (err) {
      const status = (err as { status?: number })?.status;
      claudeError = err instanceof Error ? err : new Error(String(err));
      if (status === 529 || status === 429) continue; // retryable — overloaded
      break; // non-retryable
    }
  }

  if (!rawOutput) {
    const error = claudeError?.message ?? "Unknown error after retries";
    await supabase.from("prompt_runs").insert({
      sync_run_id: syncRunId,
      prompt_version: PROMPT_VERSION,
      model: MODEL,
      duration_ms: Date.now() - startedAt,
      input_item_count: totalItems,
      output: null,
      error,
      strategy_commit_sha: getStrategyCommitSha(),
    });
    throw new Error(`Claude API call failed: ${error}`);
  }

  // Parse and validate JSON
  let parsed: unknown;
  try {
    // Strip markdown code fences if Claude added them despite instructions
    const cleaned = rawOutput.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    await supabase.from("prompt_runs").insert({
      sync_run_id: syncRunId,
      prompt_version: PROMPT_VERSION,
      model: MODEL,
      duration_ms: Date.now() - startedAt,
      input_item_count: totalItems,
      output: { raw: rawOutput },
      error: "JSON parse failed",
      strategy_commit_sha: getStrategyCommitSha(),
    });
    throw new Error(`Claude returned invalid JSON. Raw output logged to prompt_runs.`);
  }

  const validated = SynthesisOutputSchema.safeParse(parsed);
  if (!validated.success) {
    const error = validated.error.message;
    await supabase.from("prompt_runs").insert({
      sync_run_id: syncRunId,
      prompt_version: PROMPT_VERSION,
      model: MODEL,
      duration_ms: Date.now() - startedAt,
      input_item_count: totalItems,
      output: parsed,
      error: `Zod validation failed: ${error}`,
      strategy_commit_sha: getStrategyCommitSha(),
    });
    throw new Error(`Synthesis output failed schema validation: ${error}`);
  }

  const output: SynthesisOutput = validated.data;

  // Log successful run
  await supabase.from("prompt_runs").insert({
    sync_run_id: syncRunId,
    prompt_version: PROMPT_VERSION,
    model: MODEL,
    duration_ms: Date.now() - startedAt,
    input_item_count: totalItems,
    output: output as unknown as Record<string, unknown>,
    error: null,
    strategy_commit_sha: getStrategyCommitSha(),
  });

  // Write results back to database
  await writeSynthesisResults(supabase, output, weekOf);

  return output;
}

async function writeSynthesisResults(
  supabase: ReturnType<typeof createServiceClient>,
  output: SynthesisOutput,
  weekOf: string
) {
  // Reset only the selection-cycle boolean and defer state for all non-pinned ideas.
  // All synthesis-generated content (reason, callouts, status, ratings, team, KRs, jira_story)
  // is intentionally NOT cleared — it persists from the last synthesis that generated it and
  // is only overwritten when an idea is re-selected. This preserves metadata on deferred and
  // previously-selected ideas so they display correctly in the Deferred tab.
  await supabase
    .from("ideas")
    .update({
      selected_this_week: false,
      selection_week: null,
      marked_done: false,
      marked_done_at: null,
      deferred_reason: null,
    })
    .neq("id", "00000000-0000-0000-0000-000000000000")
    .is("pinned_at", null);

  // Clear selections history for this week (handles re-runs)
  await supabase.from("selections").delete().eq("week_of", weekOf);

  // Write selections to both ideas (for done-state and display) and selections (for history)
  for (const selection of output.selections) {
    await supabase
      .from("ideas")
      .update({
        selected_this_week: true,
        selection_reason: selection.reason,
        selection_status: selection.status,
        impact_rating: selection.impact_rating,
        confidence_rating: selection.confidence_rating,
        why_callout: selection.why_callout,
        customers_prospects_callout: selection.customers_prospects_callout,
        hard_deadline_notes_callout: selection.hard_deadline_notes_callout,
        team_classification: selection.team_classification,
        linked_krs: selection.linked_krs ?? null,
        selection_week: weekOf,
        selection_priority_rank: selection.priority_rank,
        jira_story: selection.jira_story,
        synthesis_title: selection.title,
      })
      .eq("canny_id", selection.canny_id);

    await supabase.from("selections").insert({
      canny_id: selection.canny_id,
      week_of: weekOf,
      priority_rank: selection.priority_rank,
      reason: selection.reason,
      jira_story: selection.jira_story ?? null,
    });
  }

  // Delete existing patterns for this week and rewrite
  const { data: existingPatterns } = await supabase
    .from("patterns")
    .select("id")
    .eq("week_of", weekOf);

  if (existingPatterns?.length) {
    await supabase
      .from("patterns")
      .delete()
      .eq("week_of", weekOf);
  }

  // Write patterns and their linked items
  for (const pattern of output.patterns) {
    const lineageId = pattern.pattern_lineage_id ?? randomUUID();
    const { data: patternRow } = await supabase
      .from("patterns")
      .insert({
        week_of: weekOf,
        title: pattern.title,
        summary: pattern.summary,
        angles: pattern.angles,
        pattern_lineage_id: lineageId,
      })
      .select("id")
      .single();

    if (!patternRow) continue;

    for (const cannyId of pattern.linked_canny_ids) {
      const { data: ideaRow } = await supabase
        .from("ideas")
        .select("id")
        .eq("canny_id", cannyId)
        .single();

      if (ideaRow) {
        await supabase.from("pattern_items").insert({
          pattern_id: patternRow.id,
          idea_id: ideaRow.id,
        });
      }
    }
  }

  // Clear and rewrite easy_wins
  await supabase.from("easy_wins").delete().eq("week_of", weekOf);

  for (const win of output.easy_wins) {
    await supabase.from("easy_wins").insert({
      canny_id: win.canny_id,
      week_of: weekOf,
      reason: win.reason,
      team_classification: win.team_classification,
      jira_story: win.jira_story,
      synthesis_title: win.title,
    });
  }
}

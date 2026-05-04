import Anthropic from "@anthropic-ai/sdk";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { createServiceClient } from "@/lib/supabase/server";
import { BOARDS } from "@/config/boards";
import { SynthesisOutputSchema } from "./schema";
import {
  buildSystemMessage,
  buildUserMessage,
  buildStrategyDocsString,
  PROMPT_VERSION,
} from "./prompt";
import type { BoardGroup, IdeaInput } from "./prompt";
import type { SynthesisOutput } from "./schema";

const MODEL = "claude-sonnet-4-6";
const TEMPERATURE = 0.3;
const STRATEGY_DIR = join(process.cwd(), "strategy");

// Week boundary: Monday 00:00:00 UTC (we store in Pacific but compare in UTC after offset)
function getWeekBounds(weekMonday: Date): { start: Date; end: Date } {
  const start = new Date(weekMonday);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 7);
  return { start, end };
}

function loadStrategyDocs(): Record<string, string> {
  const docs: Record<string, string> = {};
  const filenames = ["okrs.md", "product-diagnosis.md", "build-strategy.md"];

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

  // Date-bounded query: ONLY this week's ideas, never an unbounded select
  const weekMonday = new Date(weekOf + "T00:00:00Z");
  const { start, end } = getWeekBounds(weekMonday);

  const { data: weekIdeas, error: ideasError } = await supabase
    .from("ideas")
    .select("canny_id, title, description, vote_count, board_id, created_at, boards(slug, name)")
    .is("removed_at", null)
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString())
    .order("vote_count", { ascending: false });

  if (ideasError) throw new Error(`Failed to fetch ideas: ${ideasError.message}`);

  if (!weekIdeas || weekIdeas.length === 0) {
    throw new Error(`No ideas found for week ${weekOf}. Cannot run synthesis.`);
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

  // Load strategy docs from disk
  const strategyDocs = loadStrategyDocs();
  const strategyString = buildStrategyDocsString(strategyDocs);

  // Build prompt
  const systemMessage = buildSystemMessage();
  const userMessage = buildUserMessage(boardGroups, strategyString, weekOf);

  // Call Claude
  let rawOutput: string;
  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 8192,
      temperature: TEMPERATURE,
      system: systemMessage,
      messages: [{ role: "user", content: userMessage }],
    });

    const block = message.content[0];
    if (block.type !== "text") {
      throw new Error("Claude returned a non-text response block");
    }
    rawOutput = block.text;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
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
  // Clear previous selections for this week before writing new ones
  await supabase
    .from("ideas")
    .update({
      selected_this_week: false,
      selection_reason: null,
      selection_status: null,
      selection_week: null,
    })
    .eq("selection_week", weekOf);

  // Write selections
  for (const selection of output.selections) {
    await supabase
      .from("ideas")
      .update({
        selected_this_week: true,
        selection_reason: selection.reason,
        selection_week: weekOf,
        selection_priority_rank: selection.priority_rank,
      })
      .eq("canny_id", selection.canny_id);
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
    const { data: patternRow } = await supabase
      .from("patterns")
      .insert({
        week_of: weekOf,
        title: pattern.title,
        summary: pattern.summary,
        angles: pattern.angles,
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
}

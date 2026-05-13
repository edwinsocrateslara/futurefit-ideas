import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/server";
import { buildSystemMessage, buildUserMessage, buildStrategyDocsString } from "@/lib/synthesis/prompt";
import { SynthesisOutputSchema } from "@/lib/synthesis/schema";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import type { BoardGroup, IdeaInput } from "@/lib/synthesis/prompt";
import { BOARDS } from "@/config/boards";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Dev-only endpoint: runs Claude with the updated prompt against the currently-selected
// ideas and returns just the generated titles for review — no DB writes.
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Only available in development" }, { status: 403 });
  }

  const supabase = createServiceClient();

  // Resolve the current synthesis week
  const { data: latestWeek } = await supabase
    .from("ideas")
    .select("selection_week")
    .eq("selected_this_week", true)
    .not("selection_week", "is", null)
    .order("selection_week", { ascending: false })
    .limit(1)
    .single();

  if (!latestWeek?.selection_week) {
    return NextResponse.json({ error: "No synthesis results found" }, { status: 404 });
  }

  const weekOf = latestWeek.selection_week;

  // Fetch the currently-selected ideas as the input pool.
  // Using the live selection rather than a date-bounded query so we test
  // title framing against the real dataset that's on the dashboard.
  const { data: ideas, error: ideasError } = await supabase
    .from("ideas")
    .select("canny_id, title, description, vote_count, created_at, boards(slug, name)")
    .eq("selected_this_week", true)
    .eq("selection_week", weekOf)
    .is("removed_at", null)
    .order("vote_count", { ascending: false });

  if (ideasError || !ideas?.length) {
    return NextResponse.json({ error: "No ideas found for current week" }, { status: 404 });
  }

  // Also fetch easy-win ideas from the current week's easy_wins table
  const { data: easyWinRows } = await supabase
    .from("easy_wins")
    .select("canny_id")
    .eq("week_of", weekOf);

  const easyWinIds = new Set((easyWinRows ?? []).map((r) => r.canny_id));

  const { data: easyWinIdeas } = easyWinIds.size > 0
    ? await supabase
        .from("ideas")
        .select("canny_id, title, description, vote_count, created_at, boards(slug, name)")
        .in("canny_id", [...easyWinIds])
        .is("removed_at", null)
    : { data: [] };

  // Merge and deduplicate into board groups
  const allIdeas = [
    ...(ideas ?? []),
    ...(easyWinIdeas ?? []).filter((e) => !(ideas ?? []).some((i) => i.canny_id === e.canny_id)),
  ];

  const boardGroups: BoardGroup[] = BOARDS.map((boardConfig) => ({
    slug: boardConfig.slug,
    name: boardConfig.name,
    ideas: allIdeas
      .filter((idea) => {
        const board = idea.boards as unknown as { slug: string } | null;
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

  // Load strategy docs — same split as production: arch ref goes to TASK 3 section
  const strategyDir = join(process.cwd(), "strategy");
  const allDocs: Record<string, string> = {};
  for (const filename of [
    "okrs.md",
    "product-diagnosis.md",
    "build-strategy.md",
    "futurefit-north-star.md",
    "north-star-strategy-memo.md",
    "futurefit-architecture-reference.md",
  ]) {
    const filepath = join(strategyDir, filename);
    if (existsSync(filepath)) allDocs[filename] = readFileSync(filepath, "utf-8");
  }
  if (Object.keys(allDocs).length === 0) {
    return NextResponse.json({ error: "No strategy docs found in /strategy" }, { status: 500 });
  }

  const { "futurefit-architecture-reference.md": archContent, ...strategyOnlyDocs } = allDocs;
  const strategyString = buildStrategyDocsString(strategyOnlyDocs);
  const architectureString = archContent
    ? buildStrategyDocsString({ "futurefit-architecture-reference.md": archContent })
    : "";

  const systemMessage = buildSystemMessage();
  const userMessage = buildUserMessage(boardGroups, strategyString, weekOf, [], [], architectureString);

  // Call Claude
  const client = new Anthropic();
  let rawOutput: string;
  try {
    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 16000,
      temperature: 0.3,
      system: systemMessage,
      messages: [{ role: "user", content: userMessage }],
    });
    const block = message.content[0];
    if (block.type !== "text") throw new Error("Non-text response from Claude");
    rawOutput = block.text;
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }

  // Parse and validate
  let parsed: unknown;
  try {
    const cleaned = rawOutput.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return NextResponse.json({ error: "Claude returned invalid JSON", raw: rawOutput.slice(0, 500) }, { status: 500 });
  }

  const validated = SynthesisOutputSchema.safeParse(parsed);
  if (!validated.success) {
    return NextResponse.json({ error: "Schema validation failed", details: validated.error.message, raw: parsed }, { status: 500 });
  }

  const output = validated.data;

  // Return titles only — no DB writes
  const selections = output.selections
    .sort((a, b) => a.priority_rank - b.priority_rank)
    .map((s) => ({ rank: s.priority_rank, title: s.title, canny_id: s.canny_id }));

  const easy_wins = output.easy_wins.map((w) => ({
    title: w.title,
    canny_id: w.canny_id,
  }));

  return NextResponse.json({ week_of: weekOf, selections, easy_wins });
}

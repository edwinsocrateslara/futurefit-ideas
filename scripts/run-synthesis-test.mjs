// Test synthesis run — full historical backfill, no date filter.
// node --env-file=.env.local scripts/run-synthesis-test.mjs

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ── Config ────────────────────────────────────────────────────────────────────

const MODEL = "claude-sonnet-4-6";
const TEMPERATURE = 0.3;
const PROMPT_VERSION = "synthesis-v1.0";
const MAX_DESCRIPTION_CHARS = 300;
const WEEK_OF = "2025-01-06"; // test sentinel (Monday)

const BOARD_ORDER = [
  "customer-ideas",
  "market-ideas",
  "ux-inspiration",
  "platform-feedback",
];

// ── Clients ───────────────────────────────────────────────────────────────────

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Strategy docs ─────────────────────────────────────────────────────────────

function loadStrategyDocs() {
  const strategyDir = join(ROOT, "strategy");
  const docs = {};
  for (const fn of ["okrs.md", "product-diagnosis.md"]) {
    const fp = join(strategyDir, fn);
    if (existsSync(fp)) {
      docs[fn] = readFileSync(fp, "utf-8");
    } else {
      console.warn(`  [warn] Strategy doc not found: ${fp}`);
    }
  }
  if (Object.keys(docs).length === 0) throw new Error("No strategy docs found");
  return docs;
}

function buildStrategyDocsString(docs) {
  return Object.entries(docs)
    .map(([fn, content]) => `### ${fn}\n\n${content}`)
    .join("\n\n---\n\n");
}

// ── Prompt builders (mirrors lib/synthesis/prompt.ts) ─────────────────────────

function truncate(text, max) {
  if (!text) return "(no description)";
  return text.length > max ? text.slice(0, max).trimEnd() + "…" : text;
}

function formatIdea(idea) {
  const date = idea.created_at.slice(0, 10);
  return [
    `id:${idea.canny_id}`,
    `Title: ${idea.title}`,
    `Posted: ${date}`,
    `Description: ${truncate(idea.description, MAX_DESCRIPTION_CHARS)}`,
  ].join("\n");
}

function formatBoard(board) {
  const items = board.ideas.map(formatIdea).join("\n\n");
  return `### ${board.name} (${board.slug}) — ${board.ideas.length} items\n\n${items}`;
}

function buildSystemMessage() {
  return `You are a product strategy analyst for FutureFit AI, a workforce development platform. Each week you review customer and market feedback and surface the most strategically important signals for cross-functional leadership — the CPO, PMs, design leads, and engineering leads.

Prompt version: ${PROMPT_VERSION}

Your analysis will be read by people who are time-poor and skeptical of vague AI outputs. The quality bar is high: every selection must have a reason that a senior PM could not have written without reading the strategy documents. Generic reasons ("customers want this", "common request") do not meet this bar. Specific reasons that name OKR language, roadmap gaps, customer segments, renewal risk, or named market forces do.

The strategy documents are the lens. You are not clustering feedback for novelty or summarizing what customers want in the abstract. You are evaluating feedback against what FutureFit has committed to, what it has left unaddressed, and what it is most at risk of getting wrong.`;
}

function buildUserMessage(boards, strategyString, weekOf) {
  const totalItems = boards.reduce((n, b) => n + b.ideas.length, 0);
  const boardsSection = boards.map(formatBoard).join("\n\n---\n\n");

  return `## STRATEGY DOCUMENTS

Read these carefully before reviewing any feedback items. They are the lens for every decision below — badge assignments, selection reasoning, and pattern detection all depend on what you find here.

${strategyString}

---

## FEEDBACK ITEMS

Week: ${weekOf}
Total: ${totalItems} items across ${boards.length} boards

Each board has a different role. platform-feedback is the high-volume customer voice corpus from years of accumulated feedback. The other three boards (customer-ideas, market-ideas, ux-inspiration) are lower-volume curated streams — items appear there because someone on the team deliberately added them. There is no board quota. Strategic importance determines what makes the top 10 across all boards, regardless of which board an item comes from.

${boardsSection}

---

## TASK 1: SELECT THE TOP 10 ITEMS

Select exactly 10 items across all boards. Rank them 1–10 by strategic importance, where 1 is the most important signal leadership should discuss this week.

**What strategic importance means:**
- How directly the item connects to a gap, risk, or opportunity in the strategy documents above
- Urgency: items suggesting churn risk, competitive threat, or compounding gaps rank higher than items that are interesting but stable
- Specificity of the signal: an item that names a precise problem with concrete consequences outranks one that is vague but widely applicable

**How to write the reason field:**
The reason must be one sentence. It must be strategic, not descriptive. It should explain why this item deserves leadership attention relative to the strategy — not what the idea says.

Use this test: could a PM who had not read the strategy documents have written this reason? If yes, rewrite it.

Bad: "Customers are asking for better employer-side outcome tracking, which would improve their ability to report on placements."
Good: "Employer-side outcome tracking is the exact bottleneck named in the Market Diagnosis's 10-step outcomes workflow — this item names the ATS configuration step where Colorado Thrives has been stuck, which is why a Green adoption account is sitting at Yellow on renewal risk."

Bad: "Users want more AI coaching capabilities, and this is a popular area of feedback."
Good: "This item identifies memory and persistence as the specific AI Coach friction point — which maps directly to Engineering OKR 2 KR2's target of 70 weekly users across 10 customers, against a current baseline of 7 users across 2 customers."

Reference specific things from the strategy documents when they apply: OKR language, named customers, the green/yellow/red renewal framework, Workforce Pell, the Canadian market context, named market segments, the 'Some/Believed' outcomes framing.

**How to assign status_badge:**
Read the strategy documents to assign every badge. Do not infer from the item text alone.

Note: FutureFit's strategy documents are a market diagnosis memo and OKRs — not a traditional product roadmap. Use these definitions accordingly:
- in_flight: work on this item is actively underway this quarter — look for KRs with named owners, near-term deadlines, or language describing current work in progress
- on_roadmap: this item is referenced as planned work but without clear evidence it has started yet
- aligned: this item fits clearly with stated strategy or OKRs but is not specifically scoped as a deliverable
- gap: this item points at a real user need not addressed anywhere in the strategy documents
- critical: this item signals something broken, a churn risk, or a competitive threat requiring attention now
- watch: interesting signal, not yet actionable — often market trends or early indicators from newer boards
- new: item appeared recently and is too early to assess strategically

When in doubt between in_flight and on_roadmap, use aligned. Do not guess.

---

## TASK 2: DETECT PATTERNS

Identify 0–5 themes where multiple feedback items converge on the same underlying problem or opportunity.

**Rules for pattern detection:**
- A pattern requires at least 2 supporting items (linked_canny_ids)
- A pattern can come entirely from one board (board_scope: "single-board") or span multiple boards (board_scope: "cross-board")
- Do not force patterns to exist. If only 1 or 2 genuine patterns emerge from this data, return 1 or 2. A weak pattern with forced connections is worse than fewer sharp ones.
- Patterns should be non-obvious. A pattern names the specific underlying problem or structural gap the feedback reveals — not just a shared surface label.

Forced pattern (wrong): "Customers Want More Integrations" — three unrelated ideas about different integration types are grouped because they all mention integrations. The underlying problems are different; only the surface label is shared. This is not a pattern.
Genuine pattern (right): A theme where ideas from different contexts all expose the same structural gap — for example, multiple items that each describe a different symptom of the same broken outcomes data loop, even if none of them use that language.

**For each pattern:**
- title: 5–8 words, specific enough to be meaningful without context
- summary: 2–3 sentences. First sentence names the underlying theme. Second situates it against the strategy. Third (optional) names what makes it timely or urgent.
- board_scope: "single-board" if all evidence comes from one board, "cross-board" if multiple boards contribute
- board_count: number of distinct boards with linked evidence
- item_count: total number of linked ideas
- roadmap_alignment: no_match | partial_overlap | aligned | contradicts
- linked_canny_ids: the specific ids that constitute evidence for this pattern

**Angles — exploration prompts, not recommendations:**
The angles field is for leadership to explore the space the pattern opens. It is not a place for conclusions or recommendations.

- framing: one sentence that sets up the exploration space — what question does this pattern open?
- questions: 3–5 open-ended questions that leadership could investigate or discuss

If you find yourself writing "we should build X" or "FutureFit needs to prioritize Y", rewrite as a question: "What would building X mean for our positioning with employment services customers?" The questions should open inquiry, not close it.

- possibilities: 3–5 concrete directions the pattern opens up. Phrase as noun-phrases describing things that could exist or happen — not as imperatives or recommendations.

Bad (recommendation): "We should build a webhook integration with Year Up."
Good (possibility): "A Year Up data partnership exchanging anonymized outcome data via shared schema."

Bad (recommendation): "Prioritize making Colorado Thrives a reference case."
Good (possibility): "A focused effort to make Colorado Thrives a reference case before Workforce Pell goes live."

The test: a possibility names something that could exist or be done, without telling leadership to do it. If you can prefix the line with "we should" or "let's" and it reads naturally, rewrite it as a noun-phrase.

---

## OUTPUT FORMAT

Return a single JSON object. Your entire response must be valid JSON — no markdown fences, no preamble, no explanation, no text before the opening { or after the closing }. If your response contains anything outside the JSON object, it will fail validation and the analysis will be discarded.

{
  "week_of": "${weekOf}",
  "prompt_version": "${PROMPT_VERSION}",
  "selections": [
    {
      "canny_id": "<id from the feedback items above>",
      "priority_rank": <integer 1–10, where 1 is most important>,
      "reason": "<one strategic sentence referencing the strategy documents>",
      "status_badge": "<gap | on_roadmap | aligned | watch | new | in_flight | critical>"
    }
  ],
  "patterns": [
    {
      "title": "<5–8 words>",
      "summary": "<2–3 sentences>",
      "board_scope": "<single-board | cross-board>",
      "board_count": <integer>,
      "item_count": <integer>,
      "roadmap_alignment": "<no_match | partial_overlap | aligned | contradicts>",
      "linked_canny_ids": ["<id>"],
      "angles": {
        "framing": "<one sentence opening the exploration space>",
        "questions": ["<open-ended question>"],
        "possibilities": ["<noun-phrase describing something that could exist or happen>"]
      }
    }
  ]
}`;
}

// ── Schema validation (mirrors schema.ts) ─────────────────────────────────────

const STATUS_BADGES = new Set(["gap", "on_roadmap", "aligned", "watch", "new", "in_flight", "critical"]);
const ROADMAP_ALIGNMENTS = new Set(["no_match", "partial_overlap", "aligned", "contradicts"]);
const BOARD_SCOPES = new Set(["single-board", "cross-board"]);

function validateOutput(parsed) {
  const errors = [];

  if (typeof parsed.week_of !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(parsed.week_of)) {
    errors.push("week_of must be YYYY-MM-DD");
  }
  if (typeof parsed.prompt_version !== "string") errors.push("prompt_version must be string");

  if (!Array.isArray(parsed.selections) || parsed.selections.length !== 10) {
    errors.push(`selections must be array of exactly 10 (got ${Array.isArray(parsed.selections) ? parsed.selections.length : "non-array"})`);
  } else {
    for (const [i, s] of parsed.selections.entries()) {
      if (!s.canny_id) errors.push(`selections[${i}].canny_id missing`);
      if (typeof s.priority_rank !== "number" || s.priority_rank < 1 || s.priority_rank > 10) {
        errors.push(`selections[${i}].priority_rank must be 1–10`);
      }
      if (!s.reason) errors.push(`selections[${i}].reason missing`);
      if (!STATUS_BADGES.has(s.status_badge)) {
        errors.push(`selections[${i}].status_badge '${s.status_badge}' not valid`);
      }
    }
  }

  if (!Array.isArray(parsed.patterns)) {
    errors.push("patterns must be array");
  } else {
    for (const [i, p] of parsed.patterns.entries()) {
      if (!p.title) errors.push(`patterns[${i}].title missing`);
      if (!p.summary) errors.push(`patterns[${i}].summary missing`);
      if (!BOARD_SCOPES.has(p.board_scope)) errors.push(`patterns[${i}].board_scope invalid`);
      if (typeof p.board_count !== "number") errors.push(`patterns[${i}].board_count must be number`);
      if (typeof p.item_count !== "number" || p.item_count < 2) errors.push(`patterns[${i}].item_count must be >= 2`);
      if (!ROADMAP_ALIGNMENTS.has(p.roadmap_alignment)) errors.push(`patterns[${i}].roadmap_alignment invalid`);
      if (!Array.isArray(p.linked_canny_ids) || p.linked_canny_ids.length < 2) {
        errors.push(`patterns[${i}].linked_canny_ids must have >= 2 items`);
      }
      if (
        !p.angles?.framing ||
        !Array.isArray(p.angles?.questions) || p.angles.questions.length < 3 ||
        !Array.isArray(p.angles?.possibilities) || p.angles.possibilities.length < 3
      ) {
        errors.push(`patterns[${i}].angles invalid (needs framing, 3+ questions, 3+ possibilities)`);
      }
    }
  }

  return errors;
}

// ── DB writes ─────────────────────────────────────────────────────────────────

async function writeSynthesisResults(output, weekOf) {
  // Clear previous test selections for this week
  await supabase
    .from("ideas")
    .update({ selected_this_week: false, selection_reason: null, selection_status: null, selection_week: null })
    .eq("selection_week", weekOf);

  for (const sel of output.selections) {
    await supabase
      .from("ideas")
      .update({
        selected_this_week: true,
        selection_reason: sel.reason,
        selection_status: sel.status_badge,
        selection_week: weekOf,
        selection_priority_rank: sel.priority_rank,
      })
      .eq("canny_id", sel.canny_id);
  }

  // Clear and rewrite patterns
  await supabase.from("patterns").delete().eq("week_of", weekOf);

  for (const pattern of output.patterns) {
    const { data: patternRow } = await supabase
      .from("patterns")
      .insert({
        week_of: weekOf,
        title: pattern.title,
        summary: pattern.summary,
        board_count: pattern.board_count,
        item_count: pattern.item_count,
        roadmap_alignment: pattern.roadmap_alignment,
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

// ── Main ──────────────────────────────────────────────────────────────────────

console.log("\n[synthesis-test] Starting test run (no date filter — full backfill)\n");
const startedAt = Date.now();

// Create a test sync_run
const { data: syncRun, error: syncErr } = await supabase
  .from("sync_runs")
  .insert({
    started_at: new Date().toISOString(),
    completed_at: new Date().toISOString(),
    status: "completed",
    week_of: WEEK_OF,
    items_processed: 0,
  })
  .select("id")
  .single();

if (syncErr || !syncRun) {
  throw new Error(`Failed to create test sync_run: ${syncErr?.message}`);
}
const syncRunId = syncRun.id;
console.log(`  sync_run created: ${syncRunId}`);

// Fetch all active ideas (no date filter)
const { data: allIdeas, error: ideasErr } = await supabase
  .from("ideas")
  .select("canny_id, title, description, board_id, created_at, boards(slug, name)")
  .is("removed_at", null);

if (ideasErr) throw new Error(`Failed to fetch ideas: ${ideasErr.message}`);
console.log(`  Fetched ${allIdeas.length} active ideas (no date filter)\n`);

// Group by board in display order
const boardGroups = BOARD_ORDER
  .map((slug) => {
    const ideas = allIdeas
      .filter((idea) => {
        const board = idea.boards;
        return board?.slug === slug;
      })
      .map((idea) => ({
        canny_id: idea.canny_id,
        title: idea.title,
        description: idea.description,
        board_slug: idea.boards.slug,
        board_name: idea.boards.name,
        created_at: idea.created_at,
      }));

    const first = allIdeas.find((i) => i.boards?.slug === slug);
    return {
      slug,
      name: first?.boards?.name ?? slug,
      ideas,
    };
  })
  .filter((g) => g.ideas.length > 0);

console.log("  Board distribution:");
for (const g of boardGroups) {
  console.log(`    ${g.name} (${g.slug}): ${g.ideas.length} ideas`);
}
const totalItems = boardGroups.reduce((n, g) => n + g.ideas.length, 0);
console.log(`  Total: ${totalItems} items\n`);

// Load strategy docs
const strategyDocs = loadStrategyDocs();
const strategyString = buildStrategyDocsString(strategyDocs);
console.log(`  Strategy docs loaded: ${Object.keys(strategyDocs).join(", ")}`);

// Build prompt
const systemMessage = buildSystemMessage();
const userMessage = buildUserMessage(boardGroups, strategyString, WEEK_OF);
console.log(`  System message: ${systemMessage.length} chars`);
console.log(`  User message:   ${userMessage.length} chars`);
console.log("\n  Calling Claude...\n");

// Call Claude
let rawOutput;
let claudeDuration;
try {
  const callStart = Date.now();
  const message = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8192,
    temperature: TEMPERATURE,
    system: systemMessage,
    messages: [{ role: "user", content: userMessage }],
  });
  claudeDuration = Date.now() - callStart;

  const block = message.content[0];
  if (block.type !== "text") throw new Error("Claude returned a non-text response block");
  rawOutput = block.text;

  console.log(`  Claude responded in ${(claudeDuration / 1000).toFixed(1)}s`);
  console.log(`  stop_reason: ${message.stop_reason}`);
  console.log(`  usage: input_tokens=${message.usage.input_tokens}, output_tokens=${message.usage.output_tokens}\n`);
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
    strategy_commit_sha: "local-test",
  });
  throw new Error(`Claude API call failed: ${error}`);
}

// Parse JSON
let parsed;
try {
  const cleaned = rawOutput.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  parsed = JSON.parse(cleaned);
  console.log("  JSON parse: OK");
} catch {
  await supabase.from("prompt_runs").insert({
    sync_run_id: syncRunId,
    prompt_version: PROMPT_VERSION,
    model: MODEL,
    duration_ms: Date.now() - startedAt,
    input_item_count: totalItems,
    output: { raw: rawOutput },
    error: "JSON parse failed",
    strategy_commit_sha: "local-test",
  });
  console.error("\n  JSON parse FAILED. Raw output:\n");
  console.error(rawOutput);
  process.exit(1);
}

// Validate
const validationErrors = validateOutput(parsed);
if (validationErrors.length > 0) {
  const errorStr = validationErrors.join("; ");
  await supabase.from("prompt_runs").insert({
    sync_run_id: syncRunId,
    prompt_version: PROMPT_VERSION,
    model: MODEL,
    duration_ms: Date.now() - startedAt,
    input_item_count: totalItems,
    output: parsed,
    error: `Validation failed: ${errorStr}`,
    strategy_commit_sha: "local-test",
  });
  console.error(`\n  Validation FAILED:\n${validationErrors.map((e) => "  - " + e).join("\n")}`);
  console.error("\n  Raw parsed output:\n");
  console.error(JSON.stringify(parsed, null, 2));
  process.exit(1);
}
console.log("  Schema validation: OK\n");

// board_distribution is owned by the API layer (DB join), not the synthesis output.
// For the test script summary, derive it from the idea data we already fetched.
const cannyIdToBoard = Object.fromEntries(
  allIdeas.map((idea) => [idea.canny_id, idea.boards?.slug ?? "unknown"])
);
const boardDistribution = parsed.selections.reduce((acc, s) => {
  const slug = cannyIdToBoard[s.canny_id] ?? "unknown";
  acc[slug] = (acc[slug] ?? 0) + 1;
  return acc;
}, {});

const output = parsed;
const totalDuration = Date.now() - startedAt;

// Log to prompt_runs
const { data: promptRunRow, error: prErr } = await supabase
  .from("prompt_runs")
  .insert({
    sync_run_id: syncRunId,
    prompt_version: PROMPT_VERSION,
    model: MODEL,
    duration_ms: totalDuration,
    input_item_count: totalItems,
    output: output,
    error: null,
    strategy_commit_sha: "local-test",
  })
  .select("*")
  .single();

if (prErr) console.warn(`  [warn] Failed to insert prompt_run: ${prErr.message}`);

// Write results to DB
await writeSynthesisResults(parsed, WEEK_OF);
console.log("  Results written to DB\n");

// ── Output ────────────────────────────────────────────────────────────────────

console.log("═══════════════════════════════════════════════════════════════");
console.log("  SYNTHESIS COMPLETE");
console.log("═══════════════════════════════════════════════════════════════");
console.log(`  Total duration: ${(totalDuration / 1000).toFixed(1)}s`);
console.log(`  Claude duration: ${(claudeDuration / 1000).toFixed(1)}s`);
console.log(`  Input items: ${totalItems}`);
console.log(`  Selections: ${parsed.selections.length}`);
console.log(`  Patterns: ${parsed.patterns.length}`);
console.log(`  Board distribution: ${JSON.stringify(boardDistribution)}`);
console.log("═══════════════════════════════════════════════════════════════\n");

console.log("── FULL JSON OUTPUT ────────────────────────────────────────────\n");
console.log(JSON.stringify(output, null, 2));

if (promptRunRow) {
  console.log("\n── PROMPT_RUNS ROW ─────────────────────────────────────────────\n");
  const row = { ...promptRunRow };
  delete row.output; // already printed above
  console.log(JSON.stringify(row, null, 2));
}

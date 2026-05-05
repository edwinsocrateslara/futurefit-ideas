// Test synthesis run — full historical backfill, no date filter.
// node --env-file=.env.local scripts/run-synthesis-test.mjs

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ── Config ────────────────────────────────────────────────────────────────────

const MODEL = "claude-sonnet-4-6";
const TEMPERATURE = 0.3;
const PROMPT_VERSION = "synthesis-v2.7";
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
  for (const fn of ["okrs.md", "product-diagnosis.md", "build-strategy.md"]) {
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

// ── Prompt builders (mirrors lib/synthesis/prompt.ts v2.4) ───────────────────

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

function formatPreviousPatterns(patterns) {
  if (!patterns || patterns.length === 0) {
    return "(No previous patterns — assign null to all pattern_lineage_id fields.)";
  }
  const byWeek = new Map();
  for (const p of patterns) {
    const week = p.week_of.slice(0, 10);
    if (!byWeek.has(week)) byWeek.set(week, []);
    byWeek.get(week).push(p);
  }
  return Array.from(byWeek.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([week, ps]) => {
      const items = ps
        .map((p) => `  lineage:${p.pattern_lineage_id} | "${p.title}"\n  ${p.summary.slice(0, 200)}…`)
        .join("\n\n");
      return `[Week ${week}]\n${items}`;
    })
    .join("\n\n");
}

function formatOverrideSignals(signals) {
  if (!signals || signals.length === 0) {
    return "(No override signals in the last 4 weeks.)";
  }
  const byKey = new Map();
  for (const s of signals) {
    const direction = s.moved_up ? "up" : "down";
    const key = `${s.title}__${direction}`;
    if (!byKey.has(key)) byKey.set(key, { title: s.title, direction, count: 0 });
    byKey.get(key).count++;
  }
  return Array.from(byKey.values())
    .sort((a, b) => b.count - a.count)
    .map(({ title, direction, count }) => {
      const dirText = direction === "up" ? "moved up" : "moved down";
      if (count === 1) return `- '${title}' ${dirText} once (single-week signal)`;
      const freq = count >= 3 ? "(consistent override pattern)" : "(recurring signal)";
      return `- '${title}' ${dirText} in ${count} of 4 weeks ${freq}`;
    })
    .join("\n");
}

function buildUserMessage(boards, strategyString, weekOf, previousPatterns = [], overrideSignals = []) {
  const totalItems = boards.reduce((n, b) => n + b.ideas.length, 0);
  const boardsSection = boards.map(formatBoard).join("\n\n---\n\n");

  const lineageSection = `## PATTERN LINEAGE CONTEXT (up to last 4 weeks — may be fewer if recent)

${formatPreviousPatterns(previousPatterns)}

---

`;

  return `## STRATEGY DOCUMENTS

Read these carefully before reviewing any feedback items. They are the lens for every selection and pattern decision below.

${strategyString}

---

## FEEDBACK ITEMS

Week: ${weekOf}
Total: ${totalItems} items across ${boards.length} boards

Each board has a different role. platform-feedback is the high-volume customer voice corpus from years of accumulated feedback. The other three boards (customer-ideas, market-ideas, ux-inspiration) are lower-volume curated streams — items appear there because someone on the team deliberately added them. There is no board quota. Strategic importance determines what makes the top 10 across all boards, regardless of which board an item comes from.

${boardsSection}

---

## PREVIOUS OVERRIDE SIGNALS (last 4 weeks)

Use these signals ONLY for ranking decisions within the top 10. They should NOT influence:
- Which items qualify for the top 10 (selection criteria stay grounded in strategy documents and feedback evidence)
- Which patterns you detect (pattern detection stays grounded in cross-board evidence, not leadership preferences)
- How you write reasons for selections (reasoning stays based on strategic evidence, not what leadership has previously emphasized)

Override signals are leadership input on urgency weighting, not on what is strategically important. Treat them as a thumb on the scale for ranking within the top 10, not as evidence about what should be in the top 10 in the first place.

${formatOverrideSignals(overrideSignals)}

---

## TASK 1: SELECT THE TOP 10 ITEMS

Select exactly 10 items across all boards. Rank them 1–10 by strategic importance, where 1 is the most important signal leadership should discuss this week.

**What strategic importance means:**
- How directly the item connects to a gap, risk, or opportunity in the strategy documents above
- Urgency: items suggesting churn risk, competitive threat, or compounding gaps rank higher than items that are interesting but stable
- Specificity of the signal: an item that names a precise problem with concrete consequences outranks one that is vague but widely applicable

**Rank is the primary signal.** Item 1 is the most consequential signal leadership should act on this week. Use the full 1–10 range deliberately — the ordering itself communicates urgency and strategic weight. Do not compress rankings artificially. If the top three items are genuinely more critical than the rest, that separation should be legible in how you reason about each one.

**How to write the reason field:**
The reason must be one sentence. It must be strategic, not descriptive. It should explain why this item deserves leadership attention relative to the strategy — not what the idea says.

Use this test: could a PM who had not read the strategy documents have written this reason? If yes, rewrite it.

Bad: "Customers are asking for better employer-side outcome tracking, which would improve their ability to report on placements."
Good: "Employer-side outcome tracking is the exact bottleneck named in the Market Diagnosis's 10-step outcomes workflow — this item names the ATS configuration step where Colorado Thrives has been stuck, which is why a Green adoption account is sitting at Yellow on renewal risk."

Bad: "Users want more AI coaching capabilities, and this is a popular area of feedback."
Good: "This item identifies memory and persistence as the specific AI Coach friction point — which maps directly to Engineering OKR 2 KR2's target of 70 weekly users across 10 customers, against a current baseline of 7 users across 2 customers."

Reference specific things from the strategy documents when they apply: OKR language, named customers, the green/yellow/red renewal framework, Workforce Pell, the Canadian market context, named market segments, the 'Some/Believed' outcomes framing.

**How to write the jira_story field:**
For each selected item, generate a complete, self-contained user story in this exact format. The story describes the work — not the priority or strategic rationale. An engineer must be able to read it and understand what to build without consulting the feedback item or the reason field.

Title: [action-oriented title, max 80 chars — what is being built, not the problem]

User story:
As a [specific role — "administrator," "coach," "job seeker," "employer," "business services rep," etc.], I want [specific capability], so that [concrete outcome].

Context:
[2–3 sentences: current behavior, the gap or friction, and any technical constraints or dependencies relevant to engineering. Do not repeat the strategic reason. This is for engineers, not leadership.]

Acceptance criteria:
- [testable behavior 1]
- [testable behavior 2]
- [testable behavior 3]
[3–5 criteria total — describe what the feature does, not how it looks or how many interactions it takes]

Rules for jira_story:
- Never reference rank, priority, or strategic importance
- User role must be specific — never "user" or "platform user"
- Context must be distinct from the reason field — it describes implementation context, not strategic rationale
- Each acceptance criterion must be independently testable
- Acceptance criteria describe behavior and outcomes only — not UX patterns, interaction counts, visual design, or layout. UX decisions are made during design review with engineers and designers, not in tickets. Bad: "Completable in three taps or fewer from the home screen." Good: "The flow is accessible on mobile." Bad: "Displayed in a left-aligned sidebar." Good: "Visible to coaches and administrators in their portal views."

---

${lineageSection}## TASK 2: DETECT PATTERNS

Identify 0–5 themes where multiple feedback items converge on the same underlying problem or opportunity.

**What makes a strong pattern:**
A strong pattern is one where multiple items — regardless of which boards they come from or how they relate to the current roadmap — all expose the same underlying structural problem or opportunity. The convergence is what matters, not the surface label, not the board of origin, and not whether the pattern fits the existing strategy. A pattern that contradicts or reveals a gap in the strategy is just as valid as one that reinforces it.

**Rules for pattern detection:**
- A pattern requires at least 2 supporting items (linked_canny_ids)
- Do not force patterns to exist. If only 1 or 2 genuine patterns emerge from this data, return 1 or 2. A weak pattern with forced connections is worse than fewer sharp ones.
- Patterns should be non-obvious. A pattern names the specific underlying problem or structural gap the feedback reveals — not just a shared surface label.

Forced pattern (wrong): "Customers Want More Integrations" — three unrelated ideas about different integration types are grouped because they all mention integrations. The underlying problems are different; only the surface label is shared. This is not a pattern.
Genuine pattern (right): A theme where ideas from different contexts all expose the same structural gap — for example, multiple items that each describe a different symptom of the same broken outcomes data loop, even if none of them use that language.

**For each pattern:**
- title: 5–8 words, specific enough to be meaningful without context
- summary: 2–3 sentences. First sentence names the underlying theme. Second situates it against the strategy. Third (optional) names what makes it timely or urgent.
- linked_canny_ids: the specific ids that constitute evidence for this pattern

**Angles — exploration prompts, not recommendations:**
The angles field is for leadership to explore the space the pattern opens. It is not a place for conclusions or recommendations.

- framing: one sentence that sets up the exploration space — what question or tension does this pattern surface?

- possibilities: 3–5 concrete directions the pattern opens up. Phrase as noun-phrases describing things that could exist or happen — not as imperatives or recommendations.

Bad (recommendation): "We should build a webhook integration with Year Up."
Good (possibility): "A Year Up data partnership exchanging anonymized outcome data via shared schema."

Bad (recommendation): "Prioritize making Colorado Thrives a reference case."
Good (possibility): "A focused effort to make Colorado Thrives a reference case before Workforce Pell goes live."

The test: a possibility names something that could exist or be done, without telling leadership to do it. If you can prefix the line with "we should" or "let's" and it reads naturally, rewrite it as a noun-phrase.

**Lineage tagging — pattern_lineage_id field:**
For each detected pattern, assign a pattern_lineage_id by comparing it against the PATTERN LINEAGE CONTEXT above:
- If this pattern exposes the same underlying structural problem as a pattern in the lineage context, output that pattern's lineage_id string.
- If this is a genuinely new structural theme not present in the lineage context, output null. The system will assign a fresh id.

Lineage test: read both pattern summaries back to back. Would a reader conclude the root cause is the same problem seen through different evidence? If yes, same lineage. If the root cause is adjacent but structurally distinct — same domain, different failure mode — output null.

Correct (same lineage): "Outcomes loop broken at ATS configuration" → "Outcomes loop broken at self-report layer" — same structural gap (outcomes collection depends on parties outside our control), different evidence this week.
Incorrect (different structural problem): "Outcomes loop broken" → "Employer portal lacks candidate status tracking" — both touch outcomes, but the failure mode is employer portal depth, not collection dependency. Separate lineage.

---

## TASK 3: IDENTIFY EASY WINS

Identify exactly 5 items from the same idea pool that qualify as easy wins — things the engineering team could ship in a single sprint with no discovery work required, where the solution is obvious from the feedback itself.

**What qualifies (all must be true):**
- Clear and simple solution: the request names what to build. A developer reading it should be able to write a ticket in sprint planning without further questions.
- Low effort: small features, toggles, copy changes, single-screen UX changes, narrow filter or sort additions, missing empty states, simple validations, minor workflow tweaks.
- Fast: shippable within a sprint, ideally a few days of engineering time.
- High value relative to effort: meaningfully reduces friction despite the small scope — not trivial polish for its own sake.

**What does NOT qualify:**
- Anything requiring a new data integration or third-party API
- Multi-stakeholder workflows requiring coordination across roles (employer + admin + job seeker)
- Outcomes data architecture, measurement, or reporting infrastructure
- Ontology, taxonomy, skill graph, or AI model changes
- New platform services or infrastructure
- Anything requiring product discovery before scoping — if the solution isn't obvious from reading the feedback, it doesn't belong here

**Prefer different items from the top 10.** If an item genuinely qualifies for both, it may appear in both. But easy wins should be additive — surface items that might not rank in the top 10 for strategic reasons but are clearly shippable.

**How to write the reason field:**
Two sentences. First: what the item is asking for, in plain language. Second: why it qualifies as an easy win — what makes the solution obvious and the scope bounded.

Bad: "Customers want better filtering in the manage table, which would improve their workflow."
Good: "Administrators want to filter the manage table by a user's assigned coach. The solution is a single dropdown filter on an existing table — no new data model required since the coach-user relationship already exists."

**How to write the jira_story field:**
Same format as TASK 1 — Title, User story, Context, Acceptance criteria. For easy wins, the Context paragraph may be brief (1–2 sentences) if the scope is already clear from the feedback. Same rules apply: no UX patterns or interaction counts in acceptance criteria, specific role names, independently testable criteria.

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
      "jira_story": "<full formatted user story as a single string — Title, User story, Context, Acceptance criteria>"
    }
  ],
  "patterns": [
    {
      "title": "<5–8 words>",
      "summary": "<2–3 sentences>",
      "linked_canny_ids": ["<id>"],
      "pattern_lineage_id": "<existing UUID from lineage context, or null if new theme>",
      "angles": {
        "framing": "<one sentence opening the exploration space>",
        "possibilities": ["<noun-phrase describing something that could exist or happen>"]
      }
    }
  ],
  "easy_wins": [
    {
      "canny_id": "<id from the feedback items above>",
      "reason": "<two sentences: what the item asks for, then why it qualifies as an easy win>",
      "jira_story": "<full formatted user story as a single string — Title, User story, Context, Acceptance criteria>"
    }
  ]
}`;
}

// ── Schema validation (mirrors schema.ts v2.1) ────────────────────────────────

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
      if (!s.jira_story) errors.push(`selections[${i}].jira_story missing`);
    }
  }

  if (!Array.isArray(parsed.patterns)) {
    errors.push("patterns must be array");
  } else {
    for (const [i, p] of parsed.patterns.entries()) {
      if (!p.title) errors.push(`patterns[${i}].title missing`);
      if (!p.summary) errors.push(`patterns[${i}].summary missing`);
      if (!Array.isArray(p.linked_canny_ids) || p.linked_canny_ids.length < 2) {
        errors.push(`patterns[${i}].linked_canny_ids must have >= 2 items`);
      }
      if (
        !p.angles?.framing ||
        !Array.isArray(p.angles?.possibilities) || p.angles.possibilities.length < 3
      ) {
        errors.push(`patterns[${i}].angles invalid (needs framing + 3–5 possibilities)`);
      }
      if (
        p.pattern_lineage_id !== null &&
        p.pattern_lineage_id !== undefined &&
        typeof p.pattern_lineage_id !== "string"
      ) {
        errors.push(`patterns[${i}].pattern_lineage_id must be a UUID string or null`);
      }
    }
  }

  if (!Array.isArray(parsed.easy_wins) || parsed.easy_wins.length !== 5) {
    errors.push(`easy_wins must be array of exactly 5 (got ${Array.isArray(parsed.easy_wins) ? parsed.easy_wins.length : "non-array"})`);
  } else {
    for (const [i, w] of parsed.easy_wins.entries()) {
      if (!w.canny_id) errors.push(`easy_wins[${i}].canny_id missing`);
      if (!w.reason) errors.push(`easy_wins[${i}].reason missing`);
      if (!w.jira_story) errors.push(`easy_wins[${i}].jira_story missing`);
    }
  }

  return errors;
}

// ── DB writes ─────────────────────────────────────────────────────────────────

async function writeSynthesisResults(output, weekOf) {
  // Clear previous selections for this week
  await supabase
    .from("ideas")
    .update({ selected_this_week: false, selection_reason: null, selection_status: null, selection_week: null, jira_story: null })
    .eq("selection_week", weekOf);

  // Clear selections history for this week (handles re-runs)
  await supabase.from("selections").delete().eq("week_of", weekOf);

  for (const sel of output.selections) {
    await supabase
      .from("ideas")
      .update({
        selected_this_week: true,
        selection_reason: sel.reason,
        selection_week: weekOf,
        selection_priority_rank: sel.priority_rank,
        jira_story: sel.jira_story,
      })
      .eq("canny_id", sel.canny_id);

    await supabase.from("selections").insert({
      canny_id: sel.canny_id,
      week_of: weekOf,
      priority_rank: sel.priority_rank,
      reason: sel.reason,
      jira_story: sel.jira_story ?? null,
    });
  }

  // Clear and rewrite patterns
  await supabase.from("patterns").delete().eq("week_of", weekOf);

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
      jira_story: win.jira_story,
    });
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
      .filter((idea) => idea.boards?.slug === slug)
      .map((idea) => ({
        canny_id: idea.canny_id,
        title: idea.title,
        description: idea.description,
        board_slug: idea.boards.slug,
        board_name: idea.boards.name,
        created_at: idea.created_at,
      }));

    const first = allIdeas.find((i) => i.boards?.slug === slug);
    return { slug, name: first?.boards?.name ?? slug, ideas };
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

// Fetch previous 4 weeks of patterns for lineage context
const fourWeeksAgo = new Date(WEEK_OF + "T00:00:00Z");
fourWeeksAgo.setUTCDate(fourWeeksAgo.getUTCDate() - 28);
const { data: prevPatternRows } = await supabase
  .from("patterns")
  .select("week_of, title, summary, pattern_lineage_id")
  .lt("week_of", WEEK_OF)
  .gte("week_of", fourWeeksAgo.toISOString().slice(0, 10))
  .not("pattern_lineage_id", "is", null)
  .order("week_of", { ascending: false });

const previousPatterns = (prevPatternRows ?? [])
  .filter((p) => p.pattern_lineage_id)
  .map((p) => ({
    week_of: p.week_of,
    title: p.title,
    summary: p.summary,
    pattern_lineage_id: p.pattern_lineage_id,
  }));

console.log(`  Previous patterns loaded: ${previousPatterns.length} (from last 4 weeks)`);

// Fetch ranking override signals from last 4 weeks
const { data: overrideHistoryRows } = await supabase
  .from("ranking_overrides")
  .select("canny_id, original_rank, new_rank, week_of, ideas(title)")
  .lt("week_of", WEEK_OF)
  .gte("week_of", fourWeeksAgo.toISOString().slice(0, 10));

const overrideSignals = (overrideHistoryRows ?? []).map((row) => ({
  title: row.ideas?.title ?? row.canny_id,
  moved_up: row.new_rank < row.original_rank,
  week_of: row.week_of,
}));
console.log(`  Override signals loaded: ${overrideSignals.length} (from last 4 weeks)`);

// Build prompt
const systemMessage = buildSystemMessage();
const userMessage = buildUserMessage(boardGroups, strategyString, WEEK_OF, previousPatterns, overrideSignals);
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
    max_tokens: 16000,
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

const cannyIdToBoard = Object.fromEntries(
  allIdeas.map((idea) => [idea.canny_id, idea.boards?.slug ?? "unknown"])
);
const boardDistribution = parsed.selections.reduce((acc, s) => {
  const slug = cannyIdToBoard[s.canny_id] ?? "unknown";
  acc[slug] = (acc[slug] ?? 0) + 1;
  return acc;
}, {});

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
    output: parsed,
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
console.log(JSON.stringify(parsed, null, 2));

if (promptRunRow) {
  console.log("\n── PROMPT_RUNS ROW ─────────────────────────────────────────────\n");
  const row = { ...promptRunRow };
  delete row.output;
  console.log(JSON.stringify(row, null, 2));
}

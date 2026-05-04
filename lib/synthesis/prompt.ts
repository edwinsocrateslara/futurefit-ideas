import type { BoardSlug } from "@/config/boards";

export const PROMPT_VERSION = "synthesis-v2.3";

const MAX_DESCRIPTION_CHARS = 300;

export interface IdeaInput {
  canny_id: string;
  title: string;
  description: string | null;
  board_slug: BoardSlug;
  board_name: string;
  created_at: string;
}

export interface BoardGroup {
  slug: BoardSlug;
  name: string;
  ideas: IdeaInput[];
}

function truncate(text: string | null, max: number): string {
  if (!text) return "(no description)";
  return text.length > max ? text.slice(0, max).trimEnd() + "…" : text;
}

function formatIdea(idea: IdeaInput): string {
  const date = idea.created_at.slice(0, 10);
  return [
    `id:${idea.canny_id}`,
    `Title: ${idea.title}`,
    `Posted: ${date}`,
    `Description: ${truncate(idea.description, MAX_DESCRIPTION_CHARS)}`,
  ].join("\n");
}

function formatBoard(board: BoardGroup): string {
  const items = board.ideas.map(formatIdea).join("\n\n");
  return `### ${board.name} (${board.slug}) — ${board.ideas.length} items\n\n${items}`;
}

// ── System message ─────────────────────────────────────────────────────────

export function buildSystemMessage(): string {
  return `You are a product strategy analyst for FutureFit AI, a workforce development platform. Each week you review customer and market feedback and surface the most strategically important signals for cross-functional leadership — the CPO, PMs, design leads, and engineering leads.

Prompt version: ${PROMPT_VERSION}

Your analysis will be read by people who are time-poor and skeptical of vague AI outputs. The quality bar is high: every selection must have a reason that a senior PM could not have written without reading the strategy documents. Generic reasons ("customers want this", "common request") do not meet this bar. Specific reasons that name OKR language, roadmap gaps, customer segments, renewal risk, or named market forces do.

The strategy documents are the lens. You are not clustering feedback for novelty or summarizing what customers want in the abstract. You are evaluating feedback against what FutureFit has committed to, what it has left unaddressed, and what it is most at risk of getting wrong.`;
}

// ── User message ───────────────────────────────────────────────────────────

export function buildUserMessage(
  boards: BoardGroup[],
  strategyDocs: string,
  weekOf: string
): string {
  const totalItems = boards.reduce((n, b) => n + b.ideas.length, 0);
  const boardsSection = boards.map(formatBoard).join("\n\n---\n\n");

  return `## STRATEGY DOCUMENTS

Read these carefully before reviewing any feedback items. They are the lens for every selection and pattern decision below.

${strategyDocs}

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

## TASK 2: DETECT PATTERNS

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
      "angles": {
        "framing": "<one sentence opening the exploration space>",
        "possibilities": ["<noun-phrase describing something that could exist or happen>"]
      }
    }
  ]
}`;
}

// ── Strategy doc loader ────────────────────────────────────────────────────

export function buildStrategyDocsString(
  docs: Record<string, string>
): string {
  return Object.entries(docs)
    .map(([filename, content]) => `### ${filename}\n\n${content}`)
    .join("\n\n---\n\n");
}

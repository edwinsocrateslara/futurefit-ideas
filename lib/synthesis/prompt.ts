import type { BoardSlug } from "@/config/boards";

export const PROMPT_VERSION = "synthesis-v3.9";

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

export interface OverrideSignal {
  title: string;
  moved_up: boolean;
  week_of: string;
}

export interface PreviousPattern {
  week_of: string;
  title: string;
  summary: string;
  pattern_lineage_id: string;
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

function formatOverrideSignals(signals: OverrideSignal[]): string {
  if (signals.length === 0) {
    return "(No override signals in the last 4 weeks.)";
  }

  const byKey = new Map<string, { title: string; direction: "up" | "down"; count: number }>();
  for (const s of signals) {
    const direction = s.moved_up ? "up" : "down";
    const key = `${s.title}__${direction}`;
    if (!byKey.has(key)) byKey.set(key, { title: s.title, direction, count: 0 });
    byKey.get(key)!.count++;
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

// ── System message ─────────────────────────────────────────────────────────

export function buildSystemMessage(): string {
  return `You are a product strategy analyst for FutureFit AI, a workforce development platform. Each week you review customer and market feedback and surface the most strategically important signals for cross-functional leadership — the CPO, PMs, design leads, and engineering leads.

Prompt version: ${PROMPT_VERSION}

Your analysis will be read by people who are time-poor and skeptical of vague AI outputs. The quality bar is high: every selection must have a reason that a senior PM could not have written without reading the strategy documents. Generic reasons ("customers want this", "common request") do not meet this bar. Specific reasons that name OKR language, roadmap gaps, customer segments, renewal risk, or named market forces do.

The strategy documents are the lens. You are not clustering feedback for novelty or summarizing what customers want in the abstract. You are evaluating feedback against what FutureFit has committed to, what it has left unaddressed, and what it is most at risk of getting wrong.`;
}

// ── User message ───────────────────────────────────────────────────────────

function formatPreviousPatterns(patterns: PreviousPattern[]): string {
  if (patterns.length === 0) {
    return "(No previous patterns — assign null to all pattern_lineage_id fields.)";
  }

  const byWeek = new Map<string, PreviousPattern[]>();
  for (const p of patterns) {
    const week = p.week_of.slice(0, 10);
    if (!byWeek.has(week)) byWeek.set(week, []);
    byWeek.get(week)!.push(p);
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

export function buildUserMessage(
  boards: BoardGroup[],
  strategyDocs: string,
  weekOf: string,
  previousPatterns: PreviousPattern[] = [],
  overrideSignals: OverrideSignal[] = [],
  architectureDocs: string = ""
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

**Strategic context for this task:**
Five documents constitute the strategic frame for top 10 selection: OKRs, Product Diagnosis, Build Strategy, FutureFit North Star, and North Star Strategy Memo. All five carry equal weight. The North Star documents describe the 2031 vision, the three winning levers (distribution, the transition engine, proximity to dollars), must-have capabilities, and where-to-play discipline. They are strategic documents on equal footing with the OKRs and build priorities — an item's connection to the North Star vision (e.g. transition graph, orchestration toward outcomes, payments proximity, multi-stakeholder town square) is as valid grounds for selection as its connection to a specific OKR or build priority. Vision-aligned items must have a near-term forcing function — a named at-risk account, an OKR with current performance gap, a contractual deadline, or a specific customer pressure point — to qualify for top 10 inclusion. Connection to the 2031 vision is necessary but not sufficient; pure long-range alignment without near-term grounding belongs in the broader strategy conversation, not the weekly top 10.

**Hard deadlines are first-tier considerations:**
Items with hard external deadlines (contractual obligations to named customers, regulatory compliance dates, signed agreements with delivery commitments) are first-tier considerations and should not be displaced from the top 10 by strategic alignment alone. If an item has a documented hard deadline within the next 90 days and represents a contractual or compliance obligation, it warrants inclusion regardless of how strongly other items connect to strategic frameworks. The North Star vision, OKRs, and build priorities help rank strategically comparable items — they do not override real-world deadlines.

**What strategic importance means:**
- How directly the item connects to a gap, risk, or opportunity in the strategy documents above
- Urgency: items suggesting churn risk, competitive threat, or compounding gaps rank higher than items that are interesting but stable
- Specificity of the signal: an item that names a precise problem with concrete consequences outranks one that is vague but widely applicable

**Rank is the primary signal.** Item 1 is the most consequential signal leadership should act on this week. Use the full 1–10 range deliberately — the ordering itself communicates urgency and strategic weight. Do not compress rankings artificially. If the top three items are genuinely more critical than the rest, that separation should be legible in how you reason about each one.

**How to write the title field:**
Write a problem-oriented title that names what's broken, missing, or at risk — not the activity or process being performed. This title appears on the leadership dashboard; it is distinct from the Jira ticket title inside the jira_story field. Max 80 characters.

Good — names the problem:
- "Colorado Thrives can't ingest employer outcome data"
- "Workforce Pell compliance gap before July deadline"
- "Skills extraction missing entry-level role pathways"

Bad — names an activity (the style being replaced):
- "Leveraging outcomes from employer data collection"
- "Improving the candidate matching experience"

Test: a leader reading the title should immediately know what's wrong or at risk, without reading the reason field. If the title could describe a project rather than a problem, rewrite it.

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

Title: [copy the title field exactly — same string, verbatim. Do not write a different action-oriented title here.]

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

**Field tagging for selected items:**
After completing selection and ranking, assign a status to each of the 10 selected items. This is a second pass — status does NOT influence which items are selected or how they are ranked.

Assign exactly one of the following values:
- Contractual Requirement: bound by customer contract with explicit delivery commitment
- Renewal Risk: directly tied to a customer account at risk of not renewing
- Strategic: discretionary investment, advances long-range vision
- Need to Do: standard work that needs to happen to operate the business

When multiple statuses could apply, assign the one that reflects the primary forcing function — the most binding source of urgency. Contractual obligations override renewal risk. Renewal risk overrides strategic investment. Strategic investment overrides standard maintenance.

Example: An item that fits all four (contractual delivery, renewal-blocking, strategically aligned, and operationally needed) gets tagged Contractual Requirement because the contract is the most binding forcing function. The other categories describe additional context but don't change the primary tag.

After assigning status, assign two independent ratings to each selected item. Like status, these ratings are produced after selection and do NOT influence which items are selected or ranked.

**Impact Rating (1–4)** — How many customers or prospects would move from detractor or passive to promoter if this item ships:

1 — A single customer or prospect moves from detractor/passive to promoter
2 — 2–3 customers or prospects move from detractor/passive to promoter
3 — Three or more priority customers or prospects move from detractor/passive to promoter (Tier 1 accounts: currently WCG, Connecticut, Massachusetts)
4 — All customers or prospects move from detractor/passive to promoter

**Confidence Rating (1–4)** — Evidence supporting the impact prediction. You only have access to what appears in the Canny post content. You do NOT see internal emails, call transcripts, or team conversations. Default to conservative scoring rather than overconfident.

Confidence rating heuristic:
- Post does not reference specific customer conversations or supporting data → confidence_rating = 1
- Post mentions feedback from named customers or specific accounts → confidence_rating = 2
- Post cites both qualitative customer feedback AND quantitative data (metrics, vote counts as adoption signals, or measured outcomes) → confidence_rating = 3
- confidence_rating = 4: assign conservatively. Only when the post contains overwhelming documented evidence of impact OR the strategic framework documents explicitly identify this as a high-conviction priority.

The team will manually override confidence_rating when they have evidence you cannot see.

After assigning ratings, generate three structured callout fields for each selected item. Like status and ratings, callouts are produced after selection and do NOT influence which items are selected or ranked.

**why_callout** — The single forcing function — the cost of delay — that makes this matter now rather than next quarter. Write as a tight sentence fragment, not a full sentence. Target: ~100 characters.

Examples:
- "Last credible ship window before Workforce Pell July 1 go-live."
- "Without this, WCG renewal slips from Green to Yellow at Q3 QBR."
- "Sequencing: outcomes infrastructure must ship before MA portal launch."

Return null if no sharper single driver can be named beyond what the reason already states.

**customers_prospects_callout** — Named accounts and segments, comma-separated. No filler words. Target: ~120 characters.

Examples:
- "11 Some/Believed accounts; MA EOLWD; workforce board customers."
- "WCG, Connecticut — renewal risk; SEMI, Year Up — active prospects."

Return null if no specific customers, prospects, or segments are named or clearly implied.

**hard_deadline_notes_callout** — Telegraphic style: dates, action verbs, names. No full sentences. Target: ~140 characters.

Examples:
- "July 1, 2026 · ship before MA portal launch · ACTION: align with Mark/Sam Sprint 1."
- "Q2 board review needs status · ACTION: scope with Josh + Mark Sprint 1."

Return null if no specific deadlines, action items, or time-sensitive dependencies exist.

**Critical: the reason field must remain complete and standalone.** Callouts do not replace or summarize the reason. They surface structured data points (names, dates, categories) that a reader can use in addition to the reason. If you find yourself moving specifics out of the reason and into a callout, you have misunderstood the relationship — put the specifics in both places, or keep them in the reason. The reason field must communicate the full strategic case regardless of whether the reader sees the callouts.

Good example:

  reason: "Workforce Pell goes live July 1, 2026, and the Market Diagnosis explicitly identifies institutions that cannot report outcomes as structurally disadvantaged before end of 2026. This item directly maps WIOA/PIRL event capture to Pell eligibility tracking, addressing 11 Some/Believed accounts whose funders will face downstream reporting requirements."

  why_callout: "Last credible ship window before Workforce Pell July 1 go-live."

  customers_prospects_callout: "11 Some/Believed accounts; MA EOLWD; workforce board customers."

  hard_deadline_notes_callout: "July 1, 2026 · ship before MA portal launch · ACTION: align with Mark/Sam Sprint 1."

  The reason names accounts, dates, and regulatory framing. The callouts independently surface those same data points for quick scanning. Both have the specifics.

Bad example (reason hollowed out):

  reason: "Workforce Pell goes live July 1, 2026 and outcome tracking infrastructure is needed."

  why_callout: "Last credible ship window before Workforce Pell July 1 go-live."

  customers_prospects_callout: "11 Some/Believed accounts; MA EOLWD; workforce board customers."

  hard_deadline_notes_callout: "July 1, 2026 · ship before MA portal launch · ACTION: align with Mark/Sam Sprint 1."

  Why this is wrong: the reason has been stripped of account counts, regulatory framing, and strategic stake. Anyone reading it without the callouts gets a hollow summary. The reason field must stand alone.

**Team classification** — After generating callouts, assign a team classification to each selected item. This is the final field-tagging step and does NOT influence which items are selected or ranked.

Assign exactly one of the following values:

- "Engineering" — work that primarily involves software development: building features, fixing bugs, implementing integrations, UI/UX changes, backend services and APIs, database schema changes.

- "Data" — work that primarily involves data infrastructure or analysis: building analytics and reporting, setting up tracking and instrumentation, configuring dashboards, defining metrics, data pipeline work, data mapping and ETL.

When work spans both teams, assign whichever represents the PRIMARY type of work needed to ship it — which team owns the core deliverable?

Examples:
- Engineering: "Add bulk upload for employer outcome data" (feature build), "Fix permission bug in admin portal" (bug fix), "Build Canny custom field sync" (integration)
- Data: "Build provider analytics dashboard" (reporting), "Set up event tracking for Apply button" (instrumentation), "Define and surface conversion funnel metrics" (metrics)
- Mixed with reasoning: "Add candidate count to talent search results" — classify as Data because the work is primarily defining and surfacing the count metric, not building a new UI surface (the search results already exist)

---

## PATTERN LINEAGE CONTEXT (up to last 4 weeks — may be fewer if recent)

Review the patterns identified in recent weeks before detecting patterns below. You will use these to tag each detected pattern with a lineage identifier. Do not let this list constrain which patterns you detect — surface patterns based on the feedback items, then compare for lineage.

${formatPreviousPatterns(previousPatterns)}

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

**Lineage tagging — pattern_lineage_id field:**
For each detected pattern, assign a pattern_lineage_id by comparing it against the PATTERN LINEAGE CONTEXT above:
- If this pattern exposes the same underlying structural problem as a pattern in the lineage context, output that pattern's lineage_id string.
- If this is a genuinely new structural theme not present in the lineage context, output null. The system will assign a fresh id.

Lineage test: read both pattern summaries back to back. Would a reader conclude the root cause is the same problem seen through different evidence? If yes, same lineage. If the root cause is adjacent but structurally distinct — same domain, different failure mode — output null.

Correct (same lineage): "Outcomes loop broken at ATS configuration" → "Outcomes loop broken at self-report layer" — same structural gap (outcomes collection depends on parties outside our control), different evidence this week.
Incorrect (different structural problem): "Outcomes loop broken" → "Employer portal lacks candidate status tracking" — both touch outcomes, but the failure mode is employer portal depth, not collection dependency. Separate lineage.

---

## ARCHITECTURE REFERENCE
${architectureDocs ? `\nThe following document describes how the FutureFit AI Pathways product is built — its service structure, entity types, permission model, and established conventions. Use it as informational context for TASK 3.\n\n${architectureDocs}\n` : "\n(Architecture reference not loaded.)\n"}

---

## TASK 3: IDENTIFY EASY WINS

Identify exactly 5 items from the same idea pool that qualify as easy wins — things the engineering team could ship in a single sprint with no discovery work required, where the solution is obvious from the feedback itself.

**Architecture context for this task:**
The Architecture Reference above describes how FutureFit AI Pathways is built. Use it when judging *low effort* and *fast to ship*: items that operate within established patterns (a new filter on an existing entity, a field added to an existing GraphQL operation, a copy change, a new toggle on an existing config surface) are inherently easier to ship. Items that would require new services, cross-service schema migrations, new infrastructure, or fight the existing architecture are not easy wins regardless of how modest they sound in the feedback. Architectural fit is a tiebreaker that informs the effort judgment — it does not override the other criteria. An item with a clear, scoped solution that fits the existing architecture is a better easy win than one that fights it.

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

**How to write the title field:**
Write a solution-oriented title that names exactly what gets shipped. This appears on the leadership dashboard. Specific enough that an engineer reading it knows what to build. Max 80 characters.

Good — names the solution:
- "Change 'Paid' label to 'Cost to Enroll'"
- "Add filter for hidden vs visible job postings"
- "Update error message on invalid CSV upload"

Bad — too vague to act on:
- "Improve job posting filters"
- "Better upload error handling"

Test: an engineer reading the title should know what to build without reading the reason field. If the title could describe a general area of improvement rather than a specific deliverable, rewrite it.

**How to write the reason field:**
Two sentences. First: what the item is asking for, in plain language. Second: why it qualifies as an easy win — what makes the solution obvious and the scope bounded.

Bad: "Customers want better filtering in the manage table, which would improve their workflow."
Good: "Administrators want to filter the manage table by a user's assigned coach. The solution is a single dropdown filter on an existing table — no new data model required since the coach-user relationship already exists."

**How to write the jira_story field:**
Same format as TASK 1 — Title, User story, Context, Acceptance criteria. For easy wins, the Context paragraph may be brief (1–2 sentences) if the scope is already clear from the feedback. Same rules apply: no UX patterns or interaction counts in acceptance criteria, specific role names, independently testable criteria.

The Title line must be an exact copy of the title field for that item — same string, verbatim. Do not rephrase, make it action-oriented, or write a different title here.

**Team classification for easy wins** — Assign a team classification to each easy win using the same Engineering/Data values and primary-team reasoning as TASK 1. Easy wins are typically more clear-cut: a copy change or UI toggle is Engineering; a new metric or tracking event is Data. Assign whichever team owns the core deliverable.

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
      "title": "<problem-oriented dashboard title — what's broken, missing, or at risk, max 80 chars>",
      "reason": "<one strategic sentence referencing the strategy documents>",
      "status": "<Contractual Requirement | Renewal Risk | Strategic | Need to Do>",
      "impact_rating": <integer 1–4>,
      "confidence_rating": <integer 1–4>,
      "why_callout": "<single sentence — the primary forcing function — or null>",
      "customers_prospects_callout": "<named accounts, prospects, or segments — or null>",
      "hard_deadline_notes_callout": "<deadline, action items, or critical context — or null>",
      "team_classification": "<Engineering | Data>",
      "jira_story": "<full formatted user story as a single string — Title, User story, Context, Acceptance criteria>"
    }
  ],
  "patterns": [
    {
      "title": "<5–8 words>",
      "summary": "<2–3 sentences>",
      "linked_canny_ids": ["<id>"],
      "pattern_lineage_id": "<existing lineage UUID if continuation, null if new>",
      "angles": {
        "framing": "<one sentence opening the exploration space>",
        "possibilities": ["<noun-phrase describing something that could exist or happen>"]
      }
    }
  ],
  "easy_wins": [
    {
      "canny_id": "<id from the feedback items above>",
      "title": "<solution-oriented dashboard title — what gets shipped, max 80 chars>",
      "reason": "<two sentences: what the item asks for, then why it qualifies as an easy win>",
      "team_classification": "<Engineering | Data>",
      "jira_story": "<full formatted user story as a single string — Title, User story, Context, Acceptance criteria>"
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

// Dry-run synthesis test — verifies v3.2 status field generation.
// Calls Claude with real ideas data but does NOT write to the database.
//
// Usage: node --env-file=.env.local scripts/test-synthesis-status.mjs

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const anthropic = new Anthropic();

const VALID_STATUSES = new Set([
  "Contractual Requirement",
  "Renewal Risk",
  "Strategic",
  "Need to Do",
]);

// Fetch ideas from DB
const { data: ideas, error } = await supabase
  .from("ideas")
  .select("canny_id, title, description, vote_count, created_at, boards(slug, name)")
  .is("removed_at", null)
  .order("vote_count", { ascending: false })
  .limit(60);

if (error || !ideas?.length) {
  console.error("Failed to fetch ideas:", error?.message ?? "no ideas found");
  process.exit(1);
}

console.log(`Fetched ${ideas.length} ideas. Calling Claude with v3.2 prompt...\n`);

// Build minimal prompt that isolates the new status field behavior
const itemList = ideas
  .map((i) => {
    const board = i.boards;
    const desc = i.description ? i.description.slice(0, 200) : "(no description)";
    return `id:${i.canny_id}\nTitle: ${i.title}\nBoard: ${board?.name ?? "unknown"}\nDescription: ${desc}`;
  })
  .join("\n\n");

const weekOf = new Date().toISOString().slice(0, 10);

const userMessage = `You are a product strategy analyst. Select exactly 10 items from the list below and rank them 1–10 by strategic importance.

For each selected item, assign a status tag based on the primary forcing function:
- Contractual Requirement: bound by customer contract with explicit delivery commitment
- Renewal Risk: directly tied to a customer account at risk of not renewing
- Strategic: discretionary investment, advances long-range vision
- Need to Do: standard work that needs to happen to operate the business

When multiple statuses apply, use the most binding: Contractual Requirement > Renewal Risk > Strategic > Need to Do.

ITEMS:
${itemList}

Return a JSON object with this exact structure — no markdown, no preamble:
{
  "selections": [
    {
      "canny_id": "<id>",
      "priority_rank": <1-10>,
      "title": "<short problem-oriented title>",
      "reason": "<one sentence>",
      "status": "<one of the four values above>"
    }
  ]
}`;

const message = await anthropic.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 4000,
  temperature: 0.3,
  messages: [{ role: "user", content: userMessage }],
});

const raw = message.content[0].text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

let parsed;
try {
  parsed = JSON.parse(raw);
} catch {
  console.error("Claude returned invalid JSON:\n", raw);
  process.exit(1);
}

const selections = parsed.selections ?? [];

// Validate status fields
let allValid = true;
for (const s of selections) {
  if (!VALID_STATUSES.has(s.status)) {
    console.error(`  ✗ canny_id ${s.canny_id} has invalid status: "${s.status}"`);
    allValid = false;
  }
}

if (!allValid) {
  console.error("\nStatus validation failed — review Claude output above.");
  process.exit(1);
}

console.log(`Status field validation: PASSED (${selections.length} selections)\n`);
console.log("── Sample selections ──────────────────────────────────────────\n");

for (const s of selections.slice(0, 10)) {
  console.log(`[${s.priority_rank}] ${s.title}`);
  console.log(`    Status: ${s.status}`);
  console.log(`    Reason: ${s.reason}`);
  console.log();
}

console.log("Dry run complete. No database writes performed.");

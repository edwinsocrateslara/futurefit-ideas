// Callout brevity comparison — v3.7 (DB) vs v3.8 (Claude).
// Fetches currently-selected items and their stored v3.7 callouts, then asks Claude
// to regenerate callouts using the v3.8 instructions against the same content.
// No DB writes.
//
// Usage: node --env-file=.env.local scripts/test-callout-brevity.mjs

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const anthropic = new Anthropic();

// ── Fetch current v3.7 selections from DB ─────────────────────────────────────

const { data: rows, error } = await supabase
  .from("ideas")
  .select(
    "canny_id, title, description, selection_reason, why_callout, customers_prospects_callout, hard_deadline_notes_callout, selection_priority_rank"
  )
  .eq("selected_this_week", true)
  .is("removed_at", null)
  .order("selection_priority_rank", { ascending: true });

if (error || !rows?.length) {
  console.error("Failed to fetch selected ideas:", error?.message ?? "none found");
  process.exit(1);
}

console.log(`Fetched ${rows.length} currently-selected ideas (v3.7 callouts from DB).\n`);
console.log("Sending to Claude for v3.8 callout regeneration...\n");

// ── Build focused callout-only prompt ─────────────────────────────────────────

const itemsBlock = rows
  .map((r) => {
    const desc = r.description ? r.description.slice(0, 300) : "(no description)";
    return [
      `canny_id: ${r.canny_id}`,
      `Title: ${r.title}`,
      `Description: ${desc}`,
      `Reason (strategic context): ${r.selection_reason ?? "(none)"}`,
    ].join("\n");
  })
  .join("\n\n---\n\n");

const systemPrompt = `You are a product strategy analyst for FutureFit AI. Generate structured callout fields for each of the provided items. Follow the v3.8 callout instructions exactly.`;

const userPrompt = `Generate three callout fields for each item below, following these v3.8 instructions:

**why_callout** — The single forcing function — the cost of delay — that makes this matter now rather than next quarter. Write as a tight sentence fragment, not a full sentence. Target: ~80 characters.
Examples: "Last credible ship window before Workforce Pell July 1 go-live." | "Without this, WCG renewal slips from Green to Yellow at Q3 QBR."
Return null if no sharper single driver can be named beyond what the reason already states.

**customers_prospects_callout** — Named accounts and segments, comma-separated. No filler words. Target: ~100 characters.
Examples: "11 Some/Believed accounts; MA EOLWD; workforce board customers." | "WCG, Connecticut — renewal risk; SEMI, Year Up — active prospects."
Return null if no specific customers, prospects, or segments are named or clearly implied.

**hard_deadline_notes_callout** — Telegraphic style: dates, action verbs, names. No full sentences. Target: ~120 characters.
Examples: "July 1, 2026 · ship before MA portal launch · ACTION: align with Mark/Sam Sprint 1." | "Q2 board review needs status · ACTION: scope with Josh + Mark Sprint 1."
Return null if no specific deadlines, action items, or time-sensitive dependencies exist.

ITEMS:

${itemsBlock}

Return a JSON array — no markdown, no preamble:
[
  {
    "canny_id": "<id>",
    "why_callout": "<string or null>",
    "customers_prospects_callout": "<string or null>",
    "hard_deadline_notes_callout": "<string or null>"
  }
]`;

// ── Call Claude ────────────────────────────────────────────────────────────────

const message = await anthropic.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 4000,
  temperature: 0.3,
  system: systemPrompt,
  messages: [{ role: "user", content: userPrompt }],
});

const raw = message.content[0].text.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

let v38;
try {
  v38 = JSON.parse(raw);
} catch {
  console.error("Claude returned invalid JSON:\n", raw.slice(0, 500));
  process.exit(1);
}

const v38Map = new Map(v38.map((r) => [r.canny_id, r]));

// ── Print comparison ───────────────────────────────────────────────────────────

function charLen(s) {
  return s ? s.length : 0;
}

function fmt(label, v37, v38val) {
  const old = v37 ?? "(null)";
  const next = v38val ?? "(null)";
  const oldLen = charLen(v37);
  const newLen = charLen(v38val);
  const delta = newLen - oldLen;
  const deltaStr = delta === 0 ? "  =" : delta < 0 ? `${delta}` : `+${delta}`;
  console.log(`  ${label}`);
  console.log(`    v3.7 [${oldLen}]: ${old}`);
  console.log(`    v3.8 [${newLen}] (${deltaStr}): ${next}`);
}

let totalOld = 0;
let totalNew = 0;
let count = 0;

for (const row of rows) {
  const next = v38Map.get(row.canny_id);
  if (!next) continue;

  console.log(`\n── [#${row.selection_priority_rank}] ${row.title}`);
  fmt("Why", row.why_callout, next.why_callout);
  fmt("Customers", row.customers_prospects_callout, next.customers_prospects_callout);
  fmt("Deadline", row.hard_deadline_notes_callout, next.hard_deadline_notes_callout);

  totalOld += charLen(row.why_callout) + charLen(row.customers_prospects_callout) + charLen(row.hard_deadline_notes_callout);
  totalNew += charLen(next.why_callout) + charLen(next.customers_prospects_callout) + charLen(next.hard_deadline_notes_callout);
  count++;
}

console.log(`\n${"─".repeat(64)}`);
console.log(`Total callout chars across ${count} items:`);
console.log(`  v3.7: ${totalOld}  |  v3.8: ${totalNew}  |  delta: ${totalNew - totalOld} (${Math.round((totalNew - totalOld) / totalOld * 100)}%)`);
console.log(`  avg per item: v3.7 ${Math.round(totalOld / count)}  →  v3.8 ${Math.round(totalNew / count)}`);
console.log("\nDry run complete — no database writes performed.");

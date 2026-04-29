// Wipe all synthesis output and re-run once cleanly.
// node --env-file=.env.local scripts/reset-synthesis-state.mjs

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log("\n[reset] Clearing synthesis state...\n");

// pattern_items cascade-deletes when patterns are deleted, but delete explicitly
// so we can count what's removed.
const { count: piCount, error: piErr } = await supabase
  .from("pattern_items")
  .delete({ count: "exact" })
  .neq("pattern_id", "00000000-0000-0000-0000-000000000000"); // delete all

if (piErr) throw new Error(`pattern_items delete failed: ${piErr.message}`);
console.log(`  pattern_items deleted: ${piCount}`);

const { count: pCount, error: pErr } = await supabase
  .from("patterns")
  .delete({ count: "exact" })
  .neq("id", "00000000-0000-0000-0000-000000000000");

if (pErr) throw new Error(`patterns delete failed: ${pErr.message}`);
console.log(`  patterns deleted: ${pCount}`);

const { count: iCount, error: iErr } = await supabase
  .from("ideas")
  .update({
    selected_this_week: false,
    selection_reason: null,
    selection_status: null,
    selection_week: null,
    selection_priority_rank: null,
  }, { count: "exact" })
  .eq("selected_this_week", true);

if (iErr) throw new Error(`ideas reset failed: ${iErr.message}`);
console.log(`  ideas reset: ${iCount}`);

// Verify zeroed state
const { count: remaining } = await supabase
  .from("ideas")
  .select("*", { count: "exact", head: true })
  .eq("selected_this_week", true);

const { count: pRemaining } = await supabase
  .from("patterns")
  .select("*", { count: "exact", head: true })
  .neq("id", "00000000-0000-0000-0000-000000000000");

console.log(`\n  Verification:`);
console.log(`    ideas still selected: ${remaining} (expect 0)`);
console.log(`    patterns remaining:   ${pRemaining} (expect 0)`);

if (remaining !== 0 || pRemaining !== 0) {
  throw new Error("Reset incomplete — rows still present after delete");
}

console.log("\n[reset] Done. DB is clean.\n");

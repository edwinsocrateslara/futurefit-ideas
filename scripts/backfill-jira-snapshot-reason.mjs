// Backfill snapshot_reason for jira_links rows created before migration 022.
//
// Sets snapshot_reason from the most recent easy_wins row for each canny_id.
// All other snapshot fields (callouts, ratings, etc.) remain null for these rows —
// that is acceptable since the Accepted card does not currently display them.
//
// Safe to re-run: only updates rows where snapshot_reason IS NULL.
//
// Usage: node --env-file=.env.local scripts/backfill-jira-snapshot-reason.mjs

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data: links, error: linksError } = await supabase
  .from("jira_links")
  .select("canny_id, jira_issue_key, snapshot_reason")
  .is("snapshot_reason", null);

if (linksError) {
  console.error("Failed to fetch jira_links:", linksError.message);
  process.exit(1);
}

if (!links?.length) {
  console.log("No rows with null snapshot_reason found. Nothing to backfill.");
  process.exit(0);
}

console.log(`Found ${links.length} row(s) to backfill:\n`);

let updated = 0;
let skipped = 0;

for (const link of links) {
  const { data: win } = await supabase
    .from("easy_wins")
    .select("reason, week_of")
    .eq("canny_id", link.canny_id)
    .order("week_of", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!win?.reason) {
    console.log(`  SKIP  ${link.jira_issue_key} (${link.canny_id}) — no easy_wins row found`);
    skipped++;
    continue;
  }

  const { error: updateError } = await supabase
    .from("jira_links")
    .update({ snapshot_reason: win.reason })
    .eq("canny_id", link.canny_id);

  if (updateError) {
    console.error(`  ERROR ${link.jira_issue_key}: ${updateError.message}`);
    process.exit(1);
  }

  console.log(`  OK    ${link.jira_issue_key} — backfilled from easy_wins week ${win.week_of}`);
  console.log(`         reason: ${win.reason.slice(0, 100)}…`);
  updated++;
}

console.log(`\nDone. ${updated} updated, ${skipped} skipped.`);

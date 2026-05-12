import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getIssueStatus } from "@/lib/jira/client";
import { getJiraConfig } from "@/config/jira";
import { closePost } from "@/lib/canny/client";
import { CANNY_DONE_STATUS, CANNY_NOTIFY_VOTERS, CANNY_CHANGER_ID, buildCloseMessage } from "@/config/canny";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // In production Vercel fires this with Authorization: Bearer <CRON_SECRET>.
  // In development, skip auth so the route is directly triggerable in a browser.
  if (process.env.NODE_ENV === "production") {
    const authHeader = request.headers.get("authorization");
    const expected = `Bearer ${process.env.CRON_SECRET}`;
    if (authHeader !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const { doneStatuses } = getJiraConfig();
  const doneSet = new Set(doneStatuses);

  const supabase = createServiceClient();

  const { data: links, error: fetchError } = await supabase
    .from("jira_links")
    .select("id, canny_id, jira_issue_key, jira_status, done_at, canny_closed_at");

  if (fetchError) {
    console.error("[jira-sync] Failed to fetch jira_links:", fetchError.message);
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  const counts = { total: links?.length ?? 0, updated: 0, toDone: 0, toAccepted: 0, cannyClosed: 0, errors: 0 };

  for (const link of links ?? []) {
    try {
      const currentStatus = await getIssueStatus(link.jira_issue_key);
      const isDoneStatus = doneSet.has(currentStatus);
      const wasDone = link.done_at !== null;

      const update: Record<string, unknown> = {
        jira_status: currentStatus,
        last_synced_at: new Date().toISOString(),
      };

      if (isDoneStatus && !wasDone) {
        // Forward: Accepted → Done
        update.done_at = new Date().toISOString();
        counts.toDone++;
      } else if (!isDoneStatus && wasDone) {
        // Reverse: Done → Accepted (ticket reopened or status corrected)
        update.done_at = null;
        counts.toAccepted++;
      }

      // Close Canny post when newly done and not yet closed
      if (isDoneStatus && link.canny_closed_at === null) {
        try {
          await closePost(
            link.canny_id,
            CANNY_DONE_STATUS,
            CANNY_CHANGER_ID,
            CANNY_NOTIFY_VOTERS,
            buildCloseMessage(link.jira_issue_key)
          );
          update.canny_closed_at = new Date().toISOString();
          counts.cannyClosed++;
        } catch (cannyErr) {
          const msg = cannyErr instanceof Error ? cannyErr.message : String(cannyErr);
          console.error(`[jira-sync] Canny close failed for ${link.jira_issue_key} (${link.canny_id}):`, msg);
          // Do not set canny_closed_at — will retry on next poll
        }
      }

      const { error: updateError } = await supabase
        .from("jira_links")
        .update(update)
        .eq("id", link.id);

      if (updateError) throw updateError;
      counts.updated++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[jira-sync] ${link.jira_issue_key}:`, message);
      counts.errors++;
    }
  }

  console.log("[jira-sync] Complete:", counts);
  return NextResponse.json({ ...counts, synced_at: new Date().toISOString() });
}

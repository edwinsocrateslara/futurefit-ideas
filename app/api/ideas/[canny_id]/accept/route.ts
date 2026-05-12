import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { createIssue } from "@/lib/jira/client";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ canny_id: string }> }
) {
  const { canny_id } = await params;
  const supabase = createServiceClient();

  // Block if a Jira ticket already exists for this idea (v1: no re-accept)
  const { data: existing } = await supabase
    .from("jira_links")
    .select("jira_issue_key, jira_url")
    .eq("canny_id", canny_id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "Already has a Jira ticket", key: existing.jira_issue_key, url: existing.jira_url },
      { status: 409 }
    );
  }

  // Fetch jira_story from both possible sources in parallel.
  //
  // jira_story can exist in both ideas (from a past top-10 appearance) and easy_wins
  // (from the current easy win selection). Use whichever was generated more recently —
  // synthesis refines story content each week, and stale content would create a ticket
  // with outdated acceptance criteria or framing. Empirically these tables don't overlap
  // today, but synthesis variance means cross-list movement is possible. The date
  // comparison ensures correctness either way. Tie-breaks to easy_wins when equal.
  const [{ data: idea, error: ideaError }, { data: latestEasyWin }] = await Promise.all([
    supabase
      .from("ideas")
      .select("canny_id, title, jira_story, selection_week")
      .eq("canny_id", canny_id)
      .single(),
    supabase
      .from("easy_wins")
      .select("jira_story, week_of")
      .eq("canny_id", canny_id)
      .order("week_of", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (ideaError || !idea) {
    return NextResponse.json({ error: "Idea not found" }, { status: 404 });
  }

  // Pick the more recently generated story. Null weeks sort before any real date.
  const ideasWeek = idea.selection_week ?? "";
  const easyWinWeek = latestEasyWin?.week_of ?? "";
  const jiraStory =
    easyWinWeek >= ideasWeek
      ? (latestEasyWin?.jira_story ?? idea.jira_story)
      : idea.jira_story;

  if (!jiraStory) {
    return NextResponse.json(
      { error: "No Jira story generated for this idea — run synthesis first" },
      { status: 422 }
    );
  }

  // Create the Jira ticket
  let created;
  try {
    created = await createIssue({ jiraStoryRaw: jiraStory });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[accept] Jira createIssue failed for ${canny_id}:`, message);
    return NextResponse.json(
      { error: `Ticket creation failed: ${message}` },
      { status: 502 }
    );
  }

  // Write jira_links row. Initial status is always "Triage" — Jira sets it automatically.
  const { error: insertError } = await supabase.from("jira_links").insert({
    canny_id,
    jira_issue_key: created.key,
    jira_issue_id: created.id,
    jira_url: created.url,
    jira_status: "Triage",
    last_synced_at: new Date().toISOString(),
  });

  if (insertError) {
    console.error(`[accept] Failed to write jira_links for ${canny_id}:`, insertError.message);
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({
    key: created.key,
    url: created.url,
    status: "Triage",
  });
}

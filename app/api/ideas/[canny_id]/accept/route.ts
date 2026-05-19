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

  // Fetch jira_story, reason, and snapshot metadata from both possible sources in parallel.
  //
  // Both jira_story and reason can exist in ideas (top-10) or easy_wins. Use whichever
  // was generated more recently — synthesis refines content each week. Tie-breaks to
  // easy_wins when equal. Snapshot fields (callouts, ratings, etc.) only exist on ideas.
  const [{ data: idea, error: ideaError }, { data: latestEasyWin }] = await Promise.all([
    supabase
      .from("ideas")
      .select(
        "canny_id, title, jira_story, selection_week, selection_reason, selection_status, " +
        "why_callout, customers_prospects_callout, hard_deadline_notes_callout, " +
        "impact_rating, confidence_rating, team_classification"
      )
      .eq("canny_id", canny_id)
      .single(),
    supabase
      .from("easy_wins")
      .select("jira_story, reason, week_of")
      .eq("canny_id", canny_id)
      .order("week_of", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (ideaError || !idea) {
    return NextResponse.json({ error: "Idea not found" }, { status: 404 });
  }

  // Pick the more recently generated content. Null weeks sort before any real date.
  const ideasWeek = idea.selection_week ?? "";
  const easyWinWeek = latestEasyWin?.week_of ?? "";
  const useEasyWin = easyWinWeek >= ideasWeek;

  const jiraStory = useEasyWin
    ? (latestEasyWin?.jira_story ?? idea.jira_story)
    : idea.jira_story;

  // Snapshot reason: same week comparison. Callouts/ratings only live on ideas.
  const snapshotReason = useEasyWin
    ? (latestEasyWin?.reason ?? idea.selection_reason ?? null)
    : (idea.selection_reason ?? null);

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

  // Write jira_links row with frozen snapshot of synthesis metadata.
  // Snapshot fields are set once here and never updated — they reflect why the item
  // was accepted, regardless of what subsequent synthesis runs produce.
  const { error: insertError } = await supabase.from("jira_links").insert({
    canny_id,
    jira_issue_key: created.key,
    jira_issue_id: created.id,
    jira_url: created.url,
    jira_status: "Triage",
    last_synced_at: new Date().toISOString(),
    snapshot_reason: snapshotReason,
    snapshot_why_callout: idea.why_callout ?? null,
    snapshot_customers_callout: idea.customers_prospects_callout ?? null,
    snapshot_deadline_callout: idea.hard_deadline_notes_callout ?? null,
    snapshot_impact_rating: idea.impact_rating ?? null,
    snapshot_confidence_rating: idea.confidence_rating ?? null,
    snapshot_team_classification: idea.team_classification ?? null,
    snapshot_status: idea.selection_status ?? null,
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

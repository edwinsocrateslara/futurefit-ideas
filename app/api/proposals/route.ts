import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("quick_win_proposals")
    .select("id, canny_id, comment, created_at, ideas(title, canny_url, boards(slug, name))")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const proposals = (data ?? []).map((row) => {
    const idea = row.ideas as unknown as {
      title: string;
      canny_url: string | null;
      boards: { slug: string; name: string } | null;
    } | null;
    const board = idea?.boards ?? null;
    return {
      id: row.id,
      canny_id: row.canny_id,
      title: idea?.title ?? row.canny_id,
      board_slug: board?.slug ?? "",
      board_name: board?.name ?? "",
      canny_url: idea?.canny_url ?? null,
      comment: row.comment ?? null,
      created_at: row.created_at,
    };
  });

  return NextResponse.json({ proposals });
}

export async function POST(request: Request) {
  const supabase = createServiceClient();

  let body: { url?: string; comment?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { url, comment } = body;
  if (!url?.trim()) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }
  if (comment && comment.length > 2000) {
    return NextResponse.json({ error: "comment must be 2000 characters or fewer" }, { status: 400 });
  }

  const normalizedUrl = url.trim().replace(/\/$/, "");

  // Resolve URL or raw canny_id to a canny_id
  let canny_id: string;
  if (normalizedUrl.includes("canny.io")) {
    const { data: idea } = await supabase
      .from("ideas")
      .select("canny_id")
      .eq("canny_url", normalizedUrl)
      .single();

    if (!idea) {
      return NextResponse.json({ error: "No idea found for that Canny URL" }, { status: 404 });
    }
    canny_id = idea.canny_id;
  } else {
    const { data: idea } = await supabase
      .from("ideas")
      .select("canny_id")
      .eq("canny_id", normalizedUrl)
      .single();

    if (!idea) {
      return NextResponse.json({ error: "No idea found for that ID" }, { status: 404 });
    }
    canny_id = idea.canny_id;
  }

  // Already in Jira?
  const { data: jiraLink } = await supabase
    .from("jira_links")
    .select("canny_id")
    .eq("canny_id", canny_id)
    .single();

  if (jiraLink) {
    return NextResponse.json({ error: "This item already has a Jira ticket" }, { status: 409 });
  }

  // Already a Quick Win this week?
  const { data: latestWeek } = await supabase
    .from("ideas")
    .select("selection_week")
    .eq("selected_this_week", true)
    .not("selection_week", "is", null)
    .order("selection_week", { ascending: false })
    .limit(1)
    .single();

  if (latestWeek?.selection_week) {
    const { data: easyWin } = await supabase
      .from("easy_wins")
      .select("canny_id")
      .eq("canny_id", canny_id)
      .eq("week_of", latestWeek.selection_week)
      .single();

    if (easyWin) {
      return NextResponse.json({ error: "This item is already a Quick Win this week" }, { status: 409 });
    }
  }

  // Already an approved suggestion?
  const { data: addedProposal } = await supabase
    .from("quick_win_proposals")
    .select("id")
    .eq("canny_id", canny_id)
    .eq("status", "added")
    .single();

  if (addedProposal) {
    return NextResponse.json({ error: "This item has already been added as a Quick Win" }, { status: 409 });
  }

  // Already a pending suggestion?
  const { data: pendingProposal } = await supabase
    .from("quick_win_proposals")
    .select("id")
    .eq("canny_id", canny_id)
    .eq("status", "pending")
    .single();

  if (pendingProposal) {
    return NextResponse.json({ error: "This item already has a pending suggestion" }, { status: 409 });
  }

  const { data: inserted, error: insertError } = await supabase
    .from("quick_win_proposals")
    .insert({ canny_id, comment: comment?.trim() || null })
    .select("id, canny_id, comment, status, created_at")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json(inserted, { status: 201 });
}

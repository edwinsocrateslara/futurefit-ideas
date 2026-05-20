import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServiceClient();

  let body: { action: "add" | "reject" };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { action } = body;
  if (action !== "add" && action !== "reject") {
    return NextResponse.json({ error: "action must be 'add' or 'reject'" }, { status: 400 });
  }

  const { data: proposal, error: fetchError } = await supabase
    .from("quick_win_proposals")
    .select("id, canny_id, status")
    .eq("id", id)
    .single();

  if (fetchError || !proposal) {
    return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
  }

  if (proposal.status !== "pending") {
    return NextResponse.json({ error: "Proposal is no longer pending" }, { status: 409 });
  }

  if (action === "add") {
    const { data: jiraLink } = await supabase
      .from("jira_links")
      .select("canny_id")
      .eq("canny_id", proposal.canny_id)
      .single();

    if (jiraLink) {
      return NextResponse.json(
        { error: "This item now has a Jira ticket and cannot be added" },
        { status: 409 }
      );
    }
  }

  const { error: updateError } = await supabase
    .from("quick_win_proposals")
    .update({ status: action === "add" ? "added" : "rejected" })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ id, status: action === "add" ? "added" : "rejected" });
}

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ canny_id: string }> }
) {
  const { canny_id } = await params;
  const supabase = createServiceClient();

  const { data: idea, error: fetchError } = await supabase
    .from("ideas")
    .select("marked_done, selection_reason, selection_week")
    .eq("canny_id", canny_id)
    .single();

  if (fetchError || !idea) {
    return NextResponse.json({ error: "Idea not found" }, { status: 404 });
  }

  const next = !idea.marked_done;

  let deferredReason: string | null = null;

  if (next) {
    // Snapshot reason at defer time. Determine origin explicitly: compare the
    // most recent easy_wins week against ideas.selection_week (same logic as
    // accept route) rather than inferring from null state.
    const { data: latestEasyWin } = await supabase
      .from("easy_wins")
      .select("reason, week_of")
      .eq("canny_id", canny_id)
      .order("week_of", { ascending: false })
      .limit(1)
      .maybeSingle();

    const ideasWeek = idea.selection_week ?? "";
    const easyWinWeek = latestEasyWin?.week_of ?? "";
    const useEasyWin = easyWinWeek >= ideasWeek;

    deferredReason = useEasyWin
      ? (latestEasyWin?.reason ?? idea.selection_reason ?? null)
      : (idea.selection_reason ?? null);
  }

  const { error: updateError } = await supabase
    .from("ideas")
    .update({
      marked_done: next,
      marked_done_at: next ? new Date().toISOString() : null,
      deferred_reason: next ? deferredReason : null,
      // Deferring a pinned item clears the pin — defer supersedes pin
      ...(next ? { pinned_at: null } : {}),
    })
    .eq("canny_id", canny_id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ canny_id, marked_done: next });
}

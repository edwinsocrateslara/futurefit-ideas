import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ canny_id: string }> }
) {
  const { canny_id } = await params;
  const supabase = createServiceClient();

  let body: { source?: "top_10" | "quick_win" } = {};
  try { body = await request.json(); } catch { /* no body = unpin */ }

  const { data: idea, error: fetchError } = await supabase
    .from("ideas")
    .select("pinned_at")
    .eq("canny_id", canny_id)
    .single();

  if (fetchError || !idea) {
    return NextResponse.json({ error: "Idea not found" }, { status: 404 });
  }

  const isPinning = idea.pinned_at === null;
  const { error: updateError } = await supabase
    .from("ideas")
    .update({
      pinned_at: isPinning ? new Date().toISOString() : null,
      pinned_from: isPinning ? (body.source ?? "top_10") : null,
    })
    .eq("canny_id", canny_id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ canny_id, pinned: isPinning });
}

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
    .select("marked_done")
    .eq("canny_id", canny_id)
    .single();

  if (fetchError || !idea) {
    return NextResponse.json({ error: "Idea not found" }, { status: 404 });
  }

  const next = !idea.marked_done;
  const { error: updateError } = await supabase
    .from("ideas")
    .update({
      marked_done: next,
      marked_done_at: next ? new Date().toISOString() : null,
    })
    .eq("canny_id", canny_id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ canny_id, marked_done: next });
}

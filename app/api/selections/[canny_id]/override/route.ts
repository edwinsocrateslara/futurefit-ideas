import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ canny_id: string }> }
) {
  const supabase = createServiceClient();
  const { canny_id } = await params;
  const body: { week_of: string; original_rank: number; new_rank: number } = await req.json();
  const { week_of, original_rank, new_rank } = body;

  if (new_rank === original_rank) {
    const { error } = await supabase
      .from("ranking_overrides")
      .delete()
      .eq("canny_id", canny_id)
      .eq("week_of", week_of);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ reverted: true });
  }

  const { error } = await supabase
    .from("ranking_overrides")
    .upsert(
      { canny_id, week_of, original_rank, new_rank },
      { onConflict: "canny_id,week_of" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

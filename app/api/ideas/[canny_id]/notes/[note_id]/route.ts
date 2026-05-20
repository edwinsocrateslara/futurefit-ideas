import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ canny_id: string; note_id: string }> }
) {
  const { canny_id, note_id } = await params;
  const supabase = createServiceClient();

  const { error, count } = await supabase
    .from("idea_notes")
    .delete({ count: "exact" })
    .eq("id", note_id)
    .eq("canny_id", canny_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (count === 0) return NextResponse.json({ error: "Note not found" }, { status: 404 });

  return NextResponse.json({ deleted: true });
}

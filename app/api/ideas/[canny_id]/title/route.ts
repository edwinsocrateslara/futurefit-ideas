import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ canny_id: string }> }
) {
  const { canny_id } = await params;
  const supabase = createServiceClient();

  let body: { edited_title?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { edited_title } = body;

  // null = revert to synthesis title
  if (edited_title !== null && edited_title !== undefined) {
    const trimmed = edited_title.trim();
    if (trimmed.length === 0 || trimmed.length > 200) {
      return NextResponse.json(
        { error: "edited_title must be 1–200 characters" },
        { status: 400 }
      );
    }
    const { error } = await supabase
      .from("ideas")
      .update({ edited_title: trimmed })
      .eq("canny_id", canny_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ canny_id, edited_title: trimmed });
  }

  const { error } = await supabase
    .from("ideas")
    .update({ edited_title: null })
    .eq("canny_id", canny_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ canny_id, edited_title: null });
}

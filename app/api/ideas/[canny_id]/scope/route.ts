import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ canny_id: string }> }
) {
  const { canny_id } = await params;
  const supabase = createServiceClient();

  let body: { committed_scope?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { committed_scope } = body;

  if (committed_scope !== null && committed_scope !== undefined) {
    const trimmed = committed_scope.trim();
    if (trimmed.length === 0 || trimmed.length > 300) {
      return NextResponse.json(
        { error: "committed_scope must be 1–300 characters" },
        { status: 400 }
      );
    }
    const { error } = await supabase
      .from("ideas")
      .update({ committed_scope: trimmed })
      .eq("canny_id", canny_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ canny_id, committed_scope: trimmed });
  }

  const { error } = await supabase
    .from("ideas")
    .update({ committed_scope: null })
    .eq("canny_id", canny_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ canny_id, committed_scope: null });
}

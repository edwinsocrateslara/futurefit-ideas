import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ canny_id: string }> }
) {
  const { canny_id } = await params;
  const supabase = createServiceClient();

  let body: { items?: string[] | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { items } = body;

  if (items !== null && items !== undefined) {
    if (!Array.isArray(items)) {
      return NextResponse.json({ error: "items must be an array" }, { status: 400 });
    }
    const cleaned = items.map((s) => (typeof s === "string" ? s.trim() : "")).filter((s) => s.length > 0);
    for (const item of cleaned) {
      if (item.length > 1000) {
        return NextResponse.json({ error: "Each item must be 1–1000 characters" }, { status: 400 });
      }
    }
    const next = cleaned.length === 0 ? null : cleaned;
    const { error } = await supabase
      .from("ideas")
      .update({ committed_scope: next })
      .eq("canny_id", canny_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ canny_id, committed_scope: next });
  }

  // null → clear
  const { error } = await supabase
    .from("ideas")
    .update({ committed_scope: null })
    .eq("canny_id", canny_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ canny_id, committed_scope: null });
}

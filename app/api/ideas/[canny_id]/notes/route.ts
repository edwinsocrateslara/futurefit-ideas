import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ canny_id: string }> }
) {
  const { canny_id } = await params;
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("idea_notes")
    .select("id, note_text, created_at")
    .eq("canny_id", canny_id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ notes: data ?? [] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ canny_id: string }> }
) {
  const { canny_id } = await params;

  const body = await request.json().catch(() => null);
  const note_text = typeof body?.note_text === "string" ? body.note_text.trim() : "";

  if (!note_text) {
    return NextResponse.json({ error: "note_text is required" }, { status: 400 });
  }
  if (note_text.length > 2000) {
    return NextResponse.json({ error: "note_text exceeds 2000 characters" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { data: idea } = await supabase
    .from("ideas")
    .select("canny_id")
    .eq("canny_id", canny_id)
    .maybeSingle();

  if (!idea) return NextResponse.json({ error: "Idea not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("idea_notes")
    .insert({ canny_id, note_text })
    .select("id, note_text, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data, { status: 201 });
}

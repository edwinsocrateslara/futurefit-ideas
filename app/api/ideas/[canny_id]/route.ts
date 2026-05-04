import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ canny_id: string }> }
) {
  const { canny_id } = await params;
  const supabase = createServerClient();

  const { data: idea, error } = await supabase
    .from("ideas")
    .select(
      "canny_id, title, description, vote_count, canny_url, created_at, selection_reason, selection_week, selection_priority_rank, boards(slug, name)"
    )
    .eq("canny_id", canny_id)
    .is("removed_at", null)
    .single();

  if (error || !idea) {
    return NextResponse.json({ error: "Idea not found" }, { status: 404 });
  }

  const board = idea.boards as unknown as { slug: string; name: string } | null;

  return NextResponse.json({
    canny_id: idea.canny_id,
    title: idea.title,
    description: idea.description,
    vote_count: idea.vote_count,
    canny_url: idea.canny_url,
    board: board ? { slug: board.slug, name: board.name } : null,
    posted_at: idea.created_at,
    selection: idea.selection_week
      ? {
          week: idea.selection_week,
          priority_rank: idea.selection_priority_rank,
          reason: idea.selection_reason,
        }
      : null,
  });
}

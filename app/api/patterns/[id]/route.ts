import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import type { Angles } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServerClient();

  const { data: pattern, error } = await supabase
    .from("patterns")
    .select("id, week_of, title, summary, angles, created_at")
    .eq("id", id)
    .single();

  if (error || !pattern) {
    return NextResponse.json({ error: "Pattern not found" }, { status: 404 });
  }

  // Fetch linked ideas with full detail
  const { data: patternItems, error: itemsError } = await supabase
    .from("pattern_items")
    .select("ideas(canny_id, title, description, vote_count, canny_url, created_at, boards(slug, name))")
    .eq("pattern_id", id);

  if (itemsError) {
    return NextResponse.json({ error: itemsError.message }, { status: 500 });
  }

  const linked_ideas = (patternItems ?? []).flatMap((item) => {
    const idea = item.ideas as unknown as {
      canny_id: string;
      title: string;
      description: string | null;
      vote_count: number;
      canny_url: string | null;
      created_at: string;
      boards: { slug: string; name: string } | null;
    } | null;

    if (!idea) return [];
    return [
      {
        canny_id: idea.canny_id,
        title: idea.title,
        description: idea.description,
        vote_count: idea.vote_count,
        canny_url: idea.canny_url,
        board_slug: idea.boards?.slug ?? "",
        board_name: idea.boards?.name ?? "",
        posted_at: idea.created_at,
      },
    ];
  });

  return NextResponse.json({
    id: pattern.id,
    week_of: pattern.week_of,
    title: pattern.title,
    summary: pattern.summary,
    angles: pattern.angles as unknown as Angles,
    linked_ideas,
  });
}

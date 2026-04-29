import { createServerClient } from "@/lib/supabase/server";
import type { StatusBadge, RoadmapAlignment, Angles } from "@/lib/supabase/types";

export type BoardScope = "single-board" | "cross-board";

export interface DashboardSelection {
  canny_id: string;
  board_slug: string;
  board_name: string;
  priority_rank: number;
  reason: string;
  status_badge: StatusBadge;
  title: string;
  vote_count: number;
  canny_url: string | null;
  posted_at: string;
}

export interface DashboardPattern {
  id: string;
  title: string;
  summary: string;
  board_scope: BoardScope;
  board_count: number;
  item_count: number;
  roadmap_alignment: RoadmapAlignment;
  linked_canny_ids: string[];
  angles: Angles;
}

export interface DashboardData {
  week_of: string;
  generated_at: string | null;
  prompt_version: string | null;
  model: string | null;
  duration_ms: number | null;
  input_item_count: number | null;
  board_distribution: Record<string, number>;
  selections: DashboardSelection[];
  patterns: DashboardPattern[];
  sync: {
    id: string;
    started_at: string;
    completed_at: string | null;
    items_processed: number;
  } | null;
}

export async function getDashboardData(
  weekOf?: string
): Promise<{ data: DashboardData | null; error: string | null }> {
  const supabase = createServerClient();

  // Resolve target week
  let resolvedWeek: string;
  if (weekOf) {
    resolvedWeek = weekOf;
  } else {
    const { data: latest } = await supabase
      .from("ideas")
      .select("selection_week")
      .eq("selected_this_week", true)
      .not("selection_week", "is", null)
      .order("selection_week", { ascending: false })
      .limit(1)
      .single();

    if (!latest?.selection_week) {
      return { data: null, error: "No synthesis results found" };
    }
    resolvedWeek = latest.selection_week;
  }

  // Selections with board join
  const { data: selectedIdeas, error: ideasError } = await supabase
    .from("ideas")
    .select(
      "canny_id, title, vote_count, canny_url, created_at, selection_reason, selection_status, selection_priority_rank, boards(slug, name)"
    )
    .eq("selection_week", resolvedWeek)
    .eq("selected_this_week", true)
    .order("selection_priority_rank", { ascending: true });

  if (ideasError) return { data: null, error: ideasError.message };
  if (!selectedIdeas || selectedIdeas.length === 0) {
    return { data: null, error: `No results for week ${resolvedWeek}` };
  }

  // Patterns
  const { data: patternRows, error: patternsError } = await supabase
    .from("patterns")
    .select("id, title, summary, board_count, item_count, roadmap_alignment, angles")
    .eq("week_of", resolvedWeek);

  if (patternsError) return { data: null, error: patternsError.message };

  // Linked canny_ids per pattern
  const patternLinkedIds: Record<string, string[]> = {};
  if (patternRows && patternRows.length > 0) {
    const { data: items } = await supabase
      .from("pattern_items")
      .select("pattern_id, ideas(canny_id)")
      .in("pattern_id", patternRows.map((p) => p.id));

    for (const item of items ?? []) {
      const idea = item.ideas as unknown as { canny_id: string } | null;
      if (!idea) continue;
      if (!patternLinkedIds[item.pattern_id]) patternLinkedIds[item.pattern_id] = [];
      patternLinkedIds[item.pattern_id].push(idea.canny_id);
    }
  }

  // Sync + prompt run metadata
  const { data: syncRun } = await supabase
    .from("sync_runs")
    .select("id, started_at, completed_at, items_processed")
    .eq("week_of", resolvedWeek)
    .eq("status", "completed")
    .order("started_at", { ascending: false })
    .limit(1)
    .single();

  const { data: promptRun } = await supabase
    .from("prompt_runs")
    .select("prompt_version, model, duration_ms, input_item_count, created_at")
    .eq("sync_run_id", syncRun?.id ?? "")
    .is("error", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  // Assemble selections
  const selections: DashboardSelection[] = (selectedIdeas ?? []).map((idea) => {
    const board = idea.boards as unknown as { slug: string; name: string } | null;
    return {
      canny_id: idea.canny_id,
      board_slug: board?.slug ?? "",
      board_name: board?.name ?? "",
      priority_rank: idea.selection_priority_rank ?? 0,
      reason: idea.selection_reason ?? "",
      status_badge: (idea.selection_status ?? "watch") as StatusBadge,
      title: idea.title,
      vote_count: idea.vote_count,
      canny_url: idea.canny_url,
      posted_at: idea.created_at,
    };
  });

  const board_distribution = selections.reduce<Record<string, number>>((acc, s) => {
    acc[s.board_slug] = (acc[s.board_slug] ?? 0) + 1;
    return acc;
  }, {});

  const patterns: DashboardPattern[] = (patternRows ?? []).map((p) => ({
    id: p.id,
    title: p.title,
    summary: p.summary,
    board_scope: (p.board_count > 1 ? "cross-board" : "single-board") as BoardScope,
    board_count: p.board_count,
    item_count: p.item_count,
    roadmap_alignment: p.roadmap_alignment as RoadmapAlignment,
    linked_canny_ids: patternLinkedIds[p.id] ?? [],
    angles: p.angles as unknown as Angles,
  }));

  return {
    data: {
      week_of: resolvedWeek,
      generated_at: promptRun?.created_at ?? null,
      prompt_version: promptRun?.prompt_version ?? null,
      model: promptRun?.model ?? null,
      duration_ms: promptRun?.duration_ms ?? null,
      input_item_count: promptRun?.input_item_count ?? null,
      board_distribution,
      selections,
      patterns,
      sync: syncRun
        ? {
            id: syncRun.id,
            started_at: syncRun.started_at,
            completed_at: syncRun.completed_at,
            items_processed: syncRun.items_processed,
          }
        : null,
    },
    error: null,
  };
}

import { createServerClient } from "@/lib/supabase/server";
import type { Angles } from "@/lib/supabase/types";

export interface DashboardSelection {
  canny_id: string;
  board_slug: string;
  board_name: string;
  synthesis_rank: number;
  priority_rank: number;
  reason: string;
  title: string;
  vote_count: number;
  canny_url: string | null;
  posted_at: string;
  jira_story: string | null;
  weeks_in_top_10: number;
  is_new_this_week: boolean;
  is_persistent: boolean;
  is_overridden: boolean;
  original_rank: number | null;
  tier_1_customer: string | null;
  status: string | null;
  synthesis_status: string | null;
  is_status_overridden: boolean;
  impact_rating: number | null;
  synthesis_impact_rating: number | null;
  is_impact_overridden: boolean;
  confidence_rating: number | null;
  synthesis_confidence_rating: number | null;
  is_confidence_overridden: boolean;
}

export interface DoneItem {
  canny_id: string;
  title: string;
  board_slug: string;
  board_name: string;
  priority_rank: number | null;
  selection_week: string | null;
  marked_done_at: string;
}

export interface DashboardEasyWin {
  canny_id: string;
  title: string;
  board_slug: string;
  board_name: string;
  reason: string;
  jira_story: string | null;
  canny_url: string | null;
  tier_1_customer: string | null;
}

export interface AcceptedItem {
  canny_id: string;
  title: string;
  board_slug: string;
  board_name: string;
  reason: string;
  jira_issue_key: string;
  jira_url: string;
  jira_status: string;
  accepted_at: string;
  tier_1_customer: string | null;
}

export interface DoneJiraItem {
  canny_id: string;
  title: string;
  board_slug: string;
  board_name: string;
  reason: string;
  jira_issue_key: string;
  jira_url: string;
  jira_status: string;
  accepted_at: string;
  done_at: string;
  tier_1_customer: string | null;
}

export interface DashboardPattern {
  id: string;
  title: string;
  summary: string;
  linked_canny_ids: string[];
  angles: Angles;
  weeks_active: number;
  is_first_appearance: boolean;
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
  easy_wins: DashboardEasyWin[];
  accepted_items: AcceptedItem[];
  done_jira_items: DoneJiraItem[];
  persistent_count: number;
  new_count: number;
  persistent_titles: { canny_id: string; title: string }[];
  new_titles: { canny_id: string; title: string }[];
  sync: {
    id: string;
    started_at: string;
    completed_at: string | null;
    items_processed: number;
  } | null;
}

function pinnedSort(
  items: { canny_id: string; synthesis_rank: number }[],
  overrides: Record<string, number>
): { canny_id: string; effective_rank: number }[] {
  const slots: (string | null)[] = new Array(items.length).fill(null);
  const freeQueue: string[] = [];
  const bySynthesis = [...items].sort((a, b) => a.synthesis_rank - b.synthesis_rank);

  for (const item of bySynthesis) {
    const nr = overrides[item.canny_id];
    if (nr !== undefined) {
      const slot = nr - 1;
      if (slot >= 0 && slot < slots.length && slots[slot] === null) {
        slots[slot] = item.canny_id;
      } else {
        freeQueue.push(item.canny_id);
      }
    }
  }
  for (const item of bySynthesis) {
    if (overrides[item.canny_id] === undefined) freeQueue.push(item.canny_id);
  }

  let qi = 0;
  for (let i = 0; i < slots.length; i++) {
    if (slots[i] === null) slots[i] = freeQueue[qi++] ?? null;
  }

  return slots
    .filter((id): id is string => id !== null)
    .map((id, i) => ({ canny_id: id, effective_rank: i + 1 }));
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
      "canny_id, title, synthesis_title, tier_1_customer, vote_count, canny_url, created_at, selection_reason, selection_status, manual_status, impact_rating, manual_impact_rating, confidence_rating, manual_confidence_rating, selection_priority_rank, jira_story, boards(slug, name)"
    )
    .eq("selection_week", resolvedWeek)
    .eq("selected_this_week", true)
    .order("selection_priority_rank", { ascending: true });

  if (ideasError) return { data: null, error: ideasError.message };
  if (!selectedIdeas || selectedIdeas.length === 0) {
    return { data: null, error: `No results for week ${resolvedWeek}` };
  }

  // Selection history — count appearances per canny_id up to and including this week
  const selectedCannyIds = selectedIdeas.map((i) => i.canny_id);
  const { data: selectionHistory } = await supabase
    .from("selections")
    .select("canny_id")
    .in("canny_id", selectedCannyIds)
    .lte("week_of", resolvedWeek);

  const weeksByCanny: Record<string, number> = {};
  for (const row of selectionHistory ?? []) {
    weeksByCanny[row.canny_id] = (weeksByCanny[row.canny_id] ?? 0) + 1;
  }

  // Patterns
  const { data: patternRows, error: patternsError } = await supabase
    .from("patterns")
    .select("id, title, summary, angles, pattern_lineage_id")
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

  // Pattern lineage history — count appearances per lineage_id up to this week
  const lineageIds = (patternRows ?? [])
    .map((p) => p.pattern_lineage_id)
    .filter(Boolean) as string[];

  const weeksByLineage: Record<string, number> = {};
  if (lineageIds.length > 0) {
    const { data: lineageHistory } = await supabase
      .from("patterns")
      .select("pattern_lineage_id")
      .in("pattern_lineage_id", lineageIds)
      .lte("week_of", resolvedWeek);

    for (const row of lineageHistory ?? []) {
      if (row.pattern_lineage_id) {
        weeksByLineage[row.pattern_lineage_id] = (weeksByLineage[row.pattern_lineage_id] ?? 0) + 1;
      }
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

  // Ranking overrides for this week
  const { data: overrideRows } = await supabase
    .from("ranking_overrides")
    .select("canny_id, original_rank, new_rank")
    .eq("week_of", resolvedWeek);

  const overrideMap: Record<string, number> = {};
  for (const row of overrideRows ?? []) {
    overrideMap[row.canny_id] = row.new_rank;
  }

  // Assemble selections with synthesis_rank, then apply pinned sort
  const rawSelections = (selectedIdeas ?? []).map((idea) => {
    const board = idea.boards as unknown as { slug: string; name: string } | null;
    const weeks = weeksByCanny[idea.canny_id] ?? 1;
    const synthesisRank = idea.selection_priority_rank ?? 0;
    const isOverridden = overrideMap[idea.canny_id] !== undefined;
    return {
      canny_id: idea.canny_id,
      board_slug: board?.slug ?? "",
      board_name: board?.name ?? "",
      synthesis_rank: synthesisRank,
      priority_rank: synthesisRank,
      reason: idea.selection_reason ?? "",
      title: idea.synthesis_title ?? idea.title,
      vote_count: idea.vote_count,
      canny_url: idea.canny_url,
      posted_at: idea.created_at,
      jira_story: idea.jira_story,
      tier_1_customer: idea.tier_1_customer ?? null,
      status: (idea.manual_status ?? idea.selection_status) ?? null,
      synthesis_status: idea.selection_status ?? null,
      is_status_overridden: idea.manual_status !== null,
      impact_rating: (idea.manual_impact_rating ?? idea.impact_rating) ?? null,
      synthesis_impact_rating: idea.impact_rating ?? null,
      is_impact_overridden: idea.manual_impact_rating !== null,
      confidence_rating: (idea.manual_confidence_rating ?? idea.confidence_rating) ?? null,
      synthesis_confidence_rating: idea.confidence_rating ?? null,
      is_confidence_overridden: idea.manual_confidence_rating !== null,
      weeks_in_top_10: weeks,
      is_new_this_week: weeks === 1,
      is_persistent: weeks >= 4,
      is_overridden: isOverridden,
      original_rank: isOverridden ? synthesisRank : null,
    };
  });

  const effectiveOrder = pinnedSort(
    rawSelections.map((s) => ({ canny_id: s.canny_id, synthesis_rank: s.synthesis_rank })),
    overrideMap
  );
  const effectiveRankMap: Record<string, number> = {};
  for (const { canny_id, effective_rank } of effectiveOrder) {
    effectiveRankMap[canny_id] = effective_rank;
  }

  const selections: DashboardSelection[] = rawSelections
    .map((s) => ({ ...s, priority_rank: effectiveRankMap[s.canny_id] ?? s.synthesis_rank }))
    .sort((a, b) => a.priority_rank - b.priority_rank);

  const board_distribution = selections.reduce<Record<string, number>>((acc, s) => {
    acc[s.board_slug] = (acc[s.board_slug] ?? 0) + 1;
    return acc;
  }, {});

  const patterns: DashboardPattern[] = (patternRows ?? []).map((p) => {
    const weeks = p.pattern_lineage_id ? (weeksByLineage[p.pattern_lineage_id] ?? 1) : 1;
    return {
      id: p.id,
      title: p.title,
      summary: p.summary,
      linked_canny_ids: patternLinkedIds[p.id] ?? [],
      angles: p.angles as unknown as Angles,
      weeks_active: weeks,
      is_first_appearance: weeks === 1,
    };
  });

  // Easy wins
  const { data: easyWinRows } = await supabase
    .from("easy_wins")
    .select("canny_id, reason, jira_story, synthesis_title")
    .eq("week_of", resolvedWeek);

  const easyWinCannyIds = (easyWinRows ?? []).map((w) => w.canny_id);
  const easyWinIdeaMap: Record<string, { title: string; canny_url: string | null; board_slug: string; board_name: string; tier_1_customer: string | null }> = {};

  if (easyWinCannyIds.length > 0) {
    const { data: easyWinIdeas } = await supabase
      .from("ideas")
      .select("canny_id, title, tier_1_customer, canny_url, boards(slug, name)")
      .in("canny_id", easyWinCannyIds);

    for (const row of easyWinIdeas ?? []) {
      const board = row.boards as unknown as { slug: string; name: string } | null;
      easyWinIdeaMap[row.canny_id] = {
        title: row.title,
        canny_url: row.canny_url,
        board_slug: board?.slug ?? "",
        board_name: board?.name ?? "",
        tier_1_customer: row.tier_1_customer ?? null,
      };
    }
  }

  const easy_wins: DashboardEasyWin[] = (easyWinRows ?? []).map((w) => {
    const idea = easyWinIdeaMap[w.canny_id];
    return {
      canny_id: w.canny_id,
      title: w.synthesis_title ?? idea?.title ?? "",
      board_slug: idea?.board_slug ?? "",
      board_name: idea?.board_name ?? "",
      reason: w.reason,
      jira_story: w.jira_story,
      canny_url: idea?.canny_url ?? null,
      tier_1_customer: idea?.tier_1_customer ?? null,
    };
  });

  // All Jira-linked items — both active (done_at IS NULL) and done (done_at IS NOT NULL).
  // Fetching all rows so we can filter surfaced lists correctly regardless of done state.
  const { data: allJiraLinks } = await supabase
    .from("jira_links")
    .select("canny_id, jira_issue_key, jira_url, jira_status, accepted_at, done_at")
    .order("accepted_at", { ascending: false });

  // All Jira-tracked IDs suppress items from Top 10 / Easy Wins — Jira owns their state now.
  const jiraTrackedIds = new Set((allJiraLinks ?? []).map((j) => j.canny_id));

  const acceptedItems: AcceptedItem[] = [];
  const doneJiraItems: DoneJiraItem[] = [];

  if (allJiraLinks && allJiraLinks.length > 0) {
    const allJiraCannyIds = allJiraLinks.map((j) => j.canny_id);

    const [{ data: jiraIdeas }, { data: jiraEasyWins }] = await Promise.all([
      supabase
        .from("ideas")
        .select("canny_id, title, tier_1_customer, selection_reason, selection_week, boards(slug, name)")
        .in("canny_id", allJiraCannyIds),
      supabase
        .from("easy_wins")
        .select("canny_id, reason, week_of")
        .in("canny_id", allJiraCannyIds)
        .order("week_of", { ascending: false }),
    ]);

    const ideaMap = new Map(
      (jiraIdeas ?? []).map((i) => {
        const board = i.boards as unknown as { slug: string; name: string } | null;
        return [i.canny_id, {
          title: i.title,
          board_slug: board?.slug ?? "",
          board_name: board?.name ?? "",
          selection_reason: i.selection_reason,
          selection_week: i.selection_week,
          tier_1_customer: i.tier_1_customer ?? null,
        }];
      })
    );

    // Most recent easy_win reason per canny_id (rows already desc by week_of)
    const easyWinReasonMap = new Map<string, { reason: string; week_of: string }>();
    for (const row of jiraEasyWins ?? []) {
      if (!easyWinReasonMap.has(row.canny_id)) {
        easyWinReasonMap.set(row.canny_id, { reason: row.reason, week_of: row.week_of });
      }
    }

    for (const link of allJiraLinks) {
      const idea = ideaMap.get(link.canny_id);
      if (!idea) continue;

      // Same date comparison as the accept route: prefer the more recently generated reason
      const ideasWeek = idea.selection_week ?? "";
      const easyWinData = easyWinReasonMap.get(link.canny_id);
      const easyWinWeek = easyWinData?.week_of ?? "";
      const reason =
        easyWinWeek >= ideasWeek
          ? (easyWinData?.reason ?? idea.selection_reason ?? "")
          : (idea.selection_reason ?? "");

      const base = {
        canny_id: link.canny_id,
        title: idea.title,
        board_slug: idea.board_slug,
        board_name: idea.board_name,
        reason,
        jira_issue_key: link.jira_issue_key,
        jira_url: link.jira_url,
        jira_status: link.jira_status,
        accepted_at: link.accepted_at,
        tier_1_customer: idea.tier_1_customer,
      };

      if (link.done_at === null) {
        acceptedItems.push(base);
      } else {
        doneJiraItems.push({ ...base, done_at: link.done_at });
      }
    }
  }

  // Filter all Jira-tracked items from surfaced lists — Jira owns their state from here
  const surfacedSelections = selections.filter((s) => !jiraTrackedIds.has(s.canny_id));
  const surfacedEasyWins = easy_wins.filter((w) => !jiraTrackedIds.has(w.canny_id));

  const persistentSelections = surfacedSelections.filter((s) => s.is_persistent);
  const newSelections = surfacedSelections.filter((s) => s.is_new_this_week);

  return {
    data: {
      week_of: resolvedWeek,
      generated_at: promptRun?.created_at ?? null,
      prompt_version: promptRun?.prompt_version ?? null,
      model: promptRun?.model ?? null,
      duration_ms: promptRun?.duration_ms ?? null,
      input_item_count: promptRun?.input_item_count ?? null,
      board_distribution,
      selections: surfacedSelections,
      patterns,
      easy_wins: surfacedEasyWins,
      accepted_items: acceptedItems,
      done_jira_items: doneJiraItems,
      persistent_count: persistentSelections.length,
      new_count: newSelections.length,
      persistent_titles: persistentSelections.map((s) => ({ canny_id: s.canny_id, title: s.title })),
      new_titles: newSelections.map((s) => ({ canny_id: s.canny_id, title: s.title })),
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

export async function getDoneItems(): Promise<DoneItem[]> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("ideas")
    .select("canny_id, title, marked_done_at, selection_priority_rank, selection_week, boards(slug, name)")
    .eq("marked_done", true)
    .order("marked_done_at", { ascending: false });

  return (data ?? []).map((row) => {
    const board = row.boards as unknown as { slug: string; name: string } | null;
    return {
      canny_id: row.canny_id,
      title: row.title,
      board_slug: board?.slug ?? "",
      board_name: board?.name ?? "",
      priority_rank: row.selection_priority_rank,
      selection_week: row.selection_week,
      marked_done_at: row.marked_done_at!,
    };
  });
}

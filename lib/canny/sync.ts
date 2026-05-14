import { createServiceClient } from "@/lib/supabase/server";
import { BOARDS } from "@/config/boards";
import { fetchBoardPosts } from "./client";
import type { CannyPost } from "./client";

// Canny statuses that mean the item is done — filter these out at sync time
const COMPLETE_STATUSES = new Set(["complete", "closed", "in progress"]);

const TIER_1_CUSTOMER_FIELD_ID = "6a036c6f71be4b65f43a7fb0";

export interface SyncResult {
  syncRunId: string;
  added: number;
  updated: number;
  removed: number;
  processed: number;
  weekOf: string;
}

function getWeekMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day; // back to Monday
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function toDateString(date: Date): string {
  return date.toISOString().split("T")[0];
}

export async function runSync(): Promise<SyncResult> {
  const supabase = createServiceClient();
  const now = new Date();
  const weekOf = toDateString(getWeekMonday(now));

  // Create the sync run record
  const { data: syncRun, error: syncRunError } = await supabase
    .from("sync_runs")
    .insert({ started_at: now.toISOString(), status: "running", week_of: weekOf })
    .select("id")
    .single();

  if (syncRunError || !syncRun) {
    throw new Error(`Failed to create sync_run: ${syncRunError?.message}`);
  }

  const syncRunId = syncRun.id;
  let added = 0;
  let updated = 0;
  let removed = 0;
  let processed = 0;

  try {
    // Fetch board rows so we can map canny_id → board UUID
    const { data: boardRows } = await supabase.from("boards").select("id, canny_id");
    const boardIdMap = Object.fromEntries(
      (boardRows ?? []).map((b) => [b.canny_id, b.id])
    );

    // Track all canny_ids seen in this sync to detect removals
    const seenCannyIds = new Set<string>();

    for (const boardConfig of BOARDS) {
      const boardUuid = boardIdMap[boardConfig.cannyId];
      if (!boardUuid) {
        console.warn(`Board ${boardConfig.slug} not found in DB — did you run the migration and seed?`);
        continue;
      }

      const posts = await fetchBoardPosts(boardConfig.cannyId);

      for (const post of posts) {
        processed++;

        // Skip completed items — they're done and shouldn't surface as candidates
        if (COMPLETE_STATUSES.has(post.status?.toLowerCase())) continue;

        seenCannyIds.add(post.id);

        const payload = {
          canny_id: post.id,
          board_id: boardUuid,
          title: post.title,
          description: post.details ?? null,
          vote_count: post.score ?? 0,
          canny_url: post.url ?? null,
          created_at: post.created,
          removed_at: null,
          updated_at: new Date().toISOString(),
          tier_1_customer: post.customFields?.find(f => f.id === TIER_1_CUSTOMER_FIELD_ID)?.value ?? null,
        };

        // Upsert by canny_id
        const { data: existing } = await supabase
          .from("ideas")
          .select("id")
          .eq("canny_id", post.id)
          .single();

        if (existing) {
          await supabase.from("ideas").update(payload).eq("canny_id", post.id);
          updated++;
        } else {
          await supabase.from("ideas").insert({
            ...payload,
            selected_this_week: false,
          });
          added++;
        }

        // Sync tags
        await syncTags(supabase, post, boardUuid);
      }
    }

    // Soft-delete ideas that are no longer in Canny
    const { data: activeIdeas } = await supabase
      .from("ideas")
      .select("id, canny_id")
      .is("removed_at", null);

    for (const idea of activeIdeas ?? []) {
      if (!seenCannyIds.has(idea.canny_id)) {
        await supabase
          .from("ideas")
          .update({ removed_at: new Date().toISOString() })
          .eq("id", idea.id);
        removed++;
      }
    }

    // Mark sync complete
    await supabase.from("sync_runs").update({
      completed_at: new Date().toISOString(),
      status: "completed",
      items_processed: processed,
      items_added: added,
      items_updated: updated,
      items_removed: removed,
    }).eq("id", syncRunId);

    return { syncRunId, added, updated, removed, processed, weekOf };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase.from("sync_runs").update({
      completed_at: new Date().toISOString(),
      status: "failed",
      error: message,
      items_processed: processed,
      items_added: added,
      items_updated: updated,
      items_removed: removed,
    }).eq("id", syncRunId);
    throw err;
  }
}

async function syncTags(
  supabase: ReturnType<typeof createServiceClient>,
  post: CannyPost,
  _boardUuid: string
) {
  if (!post.tags?.length) return;

  const { data: ideaRow } = await supabase
    .from("ideas")
    .select("id")
    .eq("canny_id", post.id)
    .single();

  if (!ideaRow) return;

  for (const tag of post.tags) {
    // Upsert tag
    const { data: tagRow } = await supabase
      .from("tags")
      .upsert({ name: tag.name }, { onConflict: "name" })
      .select("id")
      .single();

    if (tagRow) {
      await supabase
        .from("idea_tags")
        .upsert({ idea_id: ideaRow.id, tag_id: tagRow.id })
        .throwOnError();
    }
  }
}

// Manual sync trigger — run with:
// node --env-file=.env.local scripts/run-sync.mjs

import { createClient } from "@supabase/supabase-js";

const CANNY_API_BASE = "https://canny.io/api/v1";

const BOARDS = [
  { cannyId: "69dd91a6101dd51b00677e0c", slug: "customer-ideas",   name: "Customer Ideas" },
  { cannyId: "69dd91d2eef3251ac9c41091", slug: "market-ideas",     name: "Market Opportunities" },
  { cannyId: "69dd91e37587ef995a08ef54", slug: "ux-inspiration",   name: "UX/UI Inspiration" },
  { cannyId: "670c2bce89df784b49c2252e", slug: "platform-feedback",name: "FutureFit AI" },
];

const COMPLETE_STATUSES = new Set(["complete", "closed"]);

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fetchAllPosts(boardId) {
  const all = [];
  let skip = 0;
  const limit = 100;

  while (true) {
    const res = await fetch(`${CANNY_API_BASE}/posts/list`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey: process.env.CANNY_API_KEY, boardID: boardId, limit, skip }),
    });
    const data = await res.json();
    all.push(...(data.posts ?? []));
    if (!data.hasMore) break;
    skip += limit;
  }
  return all;
}

// ── Main ─────────────────────────────────────────────────────────────────────

console.log("\nStarting manual sync...\n");

const { data: boardRows } = await supabase.from("boards").select("id, canny_id, name");
const boardIdMap = Object.fromEntries((boardRows ?? []).map((b) => [b.canny_id, b.id]));

let totalAdded = 0;
let totalUpdated = 0;
let totalSkipped = 0;

for (const board of BOARDS) {
  const boardUuid = boardIdMap[board.cannyId];
  if (!boardUuid) {
    console.log(`  ✗ ${board.name} — board not found in DB`);
    continue;
  }

  process.stdout.write(`  Fetching ${board.name}...`);
  const posts = await fetchAllPosts(board.cannyId);
  const active = posts.filter((p) => !COMPLETE_STATUSES.has(p.status?.toLowerCase()));
  console.log(` ${posts.length} posts (${active.length} active, ${posts.length - active.length} complete/skipped)`);

  for (const post of active) {
    const payload = {
      canny_id:    post.id,
      board_id:    boardUuid,
      title:       post.title,
      description: post.details ?? null,
      vote_count:  post.score ?? 0,
      canny_url:   post.url ?? null,
      created_at:  post.created,
      removed_at:  null,
      updated_at:  new Date().toISOString(),
      selected_this_week: false,
    };

    const { data: existing } = await supabase
      .from("ideas")
      .select("id")
      .eq("canny_id", post.id)
      .single();

    if (existing) {
      await supabase.from("ideas").update(payload).eq("canny_id", post.id);
      totalUpdated++;
    } else {
      await supabase.from("ideas").insert(payload);
      totalAdded++;
    }
  }

  totalSkipped += posts.length - active.length;
}

// ── Results ──────────────────────────────────────────────────────────────────

const { count } = await supabase
  .from("ideas")
  .select("*", { count: "exact", head: true });

console.log("\n─────────────────────────────────────");
console.log(`  Added:    ${totalAdded}`);
console.log(`  Updated:  ${totalUpdated}`);
console.log(`  Skipped:  ${totalSkipped} (complete/closed)`);
console.log(`  Total in DB: ${count}`);
console.log("─────────────────────────────────────");
console.log("Sync complete.\n");

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { runSynthesis } from "@/lib/synthesis";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

function getWeekMonday(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0 = Sunday
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().split("T")[0];
}

// Tuesday catchup: runs after the Monday synthesize cron window.
// Checks whether synthesis produced results for this week_of. If not,
// re-triggers it — self-healing for Vercel timeout failures and API outages.
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;

  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const weekOf = getWeekMonday(new Date());
  console.log(`[cron/synthesize-check] Checking week_of ${weekOf}`);

  const supabase = createServiceClient();

  // Check whether synthesis already ran for this week
  const { data: existing } = await supabase
    .from("selections")
    .select("id")
    .eq("week_of", weekOf)
    .limit(1);

  if (existing && existing.length > 0) {
    console.log(`[cron/synthesize-check] Synthesis already ran for ${weekOf} — skipping`);
    return NextResponse.json({ ok: true, action: "skipped", weekOf, reason: "synthesis already ran" });
  }

  // No synthesis this week — find the most recent completed sync and re-run
  console.log(`[cron/synthesize-check] No synthesis for ${weekOf} — triggering catchup`);

  const { data: syncRun } = await supabase
    .from("sync_runs")
    .select("id, week_of")
    .eq("status", "completed")
    .order("started_at", { ascending: false })
    .limit(1)
    .single();

  if (!syncRun) {
    const msg = "No completed sync run found — cannot run synthesis";
    console.error("[cron/synthesize-check]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 422 });
  }

  try {
    const synthesis = await runSynthesis(syncRun.id, syncRun.week_of);
    console.log(
      `[cron/synthesize-check] Catchup complete: ${synthesis.selections.length} selections, ${synthesis.patterns.length} patterns, ${synthesis.easy_wins.length} easy wins`
    );
    return NextResponse.json({
      ok: true,
      action: "ran",
      syncRunId: syncRun.id,
      weekOf: syncRun.week_of,
      selectionsCount: synthesis.selections.length,
      patternsCount: synthesis.patterns.length,
      easyWinsCount: synthesis.easy_wins.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/synthesize-check] Catchup failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { runSynthesis } from "@/lib/synthesis";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;

  if (authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[cron/synthesize] Starting synthesis");

  const supabase = createServiceClient();

  // Find the most recent completed sync run
  const { data: syncRun } = await supabase
    .from("sync_runs")
    .select("id, week_of")
    .eq("status", "completed")
    .order("started_at", { ascending: false })
    .limit(1)
    .single();

  if (!syncRun) {
    const msg = "No completed sync run found — run /api/cron/sync first";
    console.error("[cron/synthesize]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 422 });
  }

  console.log(`[cron/synthesize] Using sync run ${syncRun.id} (week ${syncRun.week_of})`);

  try {
    const synthesis = await runSynthesis(syncRun.id, syncRun.week_of);
    console.log(
      `[cron/synthesize] Complete: ${synthesis.selections.length} selections, ${synthesis.patterns.length} patterns, ${synthesis.easy_wins.length} easy wins`
    );

    return NextResponse.json({
      ok: true,
      syncRunId: syncRun.id,
      weekOf: syncRun.week_of,
      selectionsCount: synthesis.selections.length,
      patternsCount: synthesis.patterns.length,
      easyWinsCount: synthesis.easy_wins.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/synthesize] Failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

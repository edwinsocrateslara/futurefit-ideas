import { NextResponse } from "next/server";
import { runSync } from "@/lib/canny/sync";
import { runSynthesis } from "@/lib/synthesis";

// Vercel Pro: allow up to 5 minutes for this route
export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Verify cron secret to prevent unauthorized triggers
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;

  if (authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[cron/weekly] Starting weekly sync + synthesis");

  try {
    // Step 1: Sync Canny data
    const syncResult = await runSync();
    console.log("[cron/weekly] Sync complete:", syncResult);

    // Step 2: Run synthesis using the completed sync run
    const synthesis = await runSynthesis(syncResult.syncRunId, syncResult.weekOf);
    console.log(
      `[cron/weekly] Synthesis complete: ${synthesis.selections.length} selections, ${synthesis.patterns.length} patterns`
    );

    return NextResponse.json({
      ok: true,
      syncRunId: syncResult.syncRunId,
      weekOf: syncResult.weekOf,
      itemsProcessed: syncResult.processed,
      selectionsCount: synthesis.selections.length,
      patternsDetected: synthesis.patterns.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/weekly] Failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

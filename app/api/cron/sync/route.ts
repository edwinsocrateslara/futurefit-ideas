import { NextResponse } from "next/server";
import { runSync } from "@/lib/canny/sync";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;

  if (authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[cron/sync] Starting Canny sync");

  try {
    const result = await runSync();
    console.log("[cron/sync] Complete:", result);

    return NextResponse.json({
      ok: true,
      syncRunId: result.syncRunId,
      weekOf: result.weekOf,
      added: result.added,
      updated: result.updated,
      removed: result.removed,
      processed: result.processed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[cron/sync] Failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

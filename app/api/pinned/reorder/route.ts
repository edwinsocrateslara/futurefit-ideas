import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  const supabase = createServiceClient();

  let body: { ordered_canny_ids?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { ordered_canny_ids } = body;
  if (!Array.isArray(ordered_canny_ids) || ordered_canny_ids.some((id) => typeof id !== "string")) {
    return NextResponse.json({ error: "ordered_canny_ids must be an array of strings" }, { status: 400 });
  }

  // Write each position atomically — index 0 = sort_order 1
  const updates = ordered_canny_ids.map((canny_id, i) =>
    supabase.from("ideas").update({ pin_sort_order: i + 1 }).eq("canny_id", canny_id)
  );

  const results = await Promise.all(updates);
  const failed = results.find((r) => r.error);
  if (failed?.error) {
    return NextResponse.json({ error: failed.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

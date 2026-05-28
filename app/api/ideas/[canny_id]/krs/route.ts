import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ canny_id: string }> }
) {
  const supabase = createServiceClient();
  const { canny_id } = await params;

  let body: { manual_linked_krs?: string[] | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { manual_linked_krs } = body;
  if (manual_linked_krs !== undefined && manual_linked_krs !== null && !Array.isArray(manual_linked_krs)) {
    return NextResponse.json({ error: "manual_linked_krs must be an array or null" }, { status: 400 });
  }

  const { error } = await supabase
    .from("ideas")
    .update({ manual_linked_krs: manual_linked_krs ?? null })
    .eq("canny_id", canny_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

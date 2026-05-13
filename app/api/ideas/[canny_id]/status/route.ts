import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

const VALID_STATUSES = new Set([
  "Contractual Requirement",
  "Renewal Risk",
  "Strategic",
  "Need to Do",
]);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ canny_id: string }> }
) {
  const { canny_id } = await params;
  const body = await request.json() as { status: string | null };
  const { status } = body;

  if (status !== null && !VALID_STATUSES.has(status)) {
    return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
  }

  const supabase = createServiceClient();

  const { error } = await supabase
    .from("ideas")
    .update({ manual_status: status })
    .eq("canny_id", canny_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ manual_status: status });
}

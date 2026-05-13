import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

function isValidRating(v: unknown): boolean {
  return v === null || (Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 4);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ canny_id: string }> }
) {
  const { canny_id } = await params;
  const body = await request.json() as {
    impact_rating?: number | null;
    confidence_rating?: number | null;
  };

  if ("impact_rating" in body && !isValidRating(body.impact_rating)) {
    return NextResponse.json({ error: "impact_rating must be an integer 1–4 or null" }, { status: 400 });
  }
  if ("confidence_rating" in body && !isValidRating(body.confidence_rating)) {
    return NextResponse.json({ error: "confidence_rating must be an integer 1–4 or null" }, { status: 400 });
  }

  const update: Record<string, number | null> = {};
  if ("impact_rating" in body) update.manual_impact_rating = body.impact_rating ?? null;
  if ("confidence_rating" in body) update.manual_confidence_rating = body.confidence_rating ?? null;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase.from("ideas").update(update).eq("canny_id", canny_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(update);
}

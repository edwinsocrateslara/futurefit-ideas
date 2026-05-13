import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { TEAM_CLASSIFICATION_VALUES } from "@/lib/synthesis/schema";

const VALID_CLASSIFICATIONS = new Set(TEAM_CLASSIFICATION_VALUES);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ canny_id: string }> }
) {
  const { canny_id } = await params;
  const body = await request.json() as { team_classification: string | null };
  const { team_classification } = body;

  if (team_classification !== null && !VALID_CLASSIFICATIONS.has(team_classification as never)) {
    return NextResponse.json({ error: "Invalid team_classification value" }, { status: 400 });
  }

  const supabase = createServiceClient();
  const { error } = await supabase
    .from("ideas")
    .update({ manual_team_classification: team_classification })
    .eq("canny_id", canny_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ manual_team_classification: team_classification });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ canny_id: string }> }
) {
  const { canny_id } = await params;
  const supabase = createServiceClient();
  const { error } = await supabase
    .from("ideas")
    .update({ manual_team_classification: null })
    .eq("canny_id", canny_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ manual_team_classification: null });
}

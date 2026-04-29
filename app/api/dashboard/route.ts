import { NextResponse } from "next/server";
import { getDashboardData } from "@/lib/data/dashboard";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const weekParam = searchParams.get("week");

  if (weekParam && !/^\d{4}-\d{2}-\d{2}$/.test(weekParam)) {
    return NextResponse.json(
      { error: "Invalid week format — use YYYY-MM-DD" },
      { status: 400 }
    );
  }

  const { data, error } = await getDashboardData(weekParam ?? undefined);

  if (error || !data) {
    return NextResponse.json({ error: error ?? "Not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}

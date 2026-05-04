import { NextResponse } from "next/server";
import { getDoneItems } from "@/lib/data/dashboard";

export const dynamic = "force-dynamic";

export async function GET() {
  const items = await getDoneItems();
  return NextResponse.json(items);
}

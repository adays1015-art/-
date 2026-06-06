import { NextResponse } from "next/server";
import { listHistory } from "@/services/history";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ data: await listHistory() });
}

import { NextResponse } from "next/server";
import { listFinishedSets } from "@/services/finishedSets";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ data: await listFinishedSets() });
}

import { NextResponse } from "next/server";
import { getCompany, updateCompany } from "@/services/company";
import type { CompanyInfo } from "@/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ data: await getCompany() });
}

export async function POST(req: Request) {
  let body: { data?: Partial<CompanyInfo> } & Partial<CompanyInfo>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const patch = (body.data ?? body) as Partial<CompanyInfo>;
  const updated = await updateCompany(patch);
  return NextResponse.json({ data: updated });
}

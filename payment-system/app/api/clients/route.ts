import { NextResponse } from "next/server";
import {
  listClients, createClient, updateClient, deleteClient,
} from "@/services/clients";
import type { PayClient } from "@/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ data: await listClients() });
}

export async function POST(req: Request) {
  let body: { action?: string; [k: string]: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const action = body.action;
  if (action === "update") {
    const { id, patch } = body as { id: string; patch: Partial<PayClient> };
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const updated = await updateClient(id, patch);
    if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ data: updated });
  }
  if (action === "delete") {
    const { id } = body as { id: string };
    const ok = await deleteClient(id);
    if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ data: { id } });
  }
  const dataIn = ("data" in body ? body.data : body) as Partial<PayClient>;
  if (!dataIn?.name?.trim()) {
    return NextResponse.json({ error: "거래처명 필수" }, { status: 400 });
  }
  const created = await createClient({ ...dataIn, name: dataIn.name });
  return NextResponse.json({ data: created });
}

import { NextResponse } from "next/server";
import {
  listClients, createClient, updateClient,
  activateClient, deactivateClient,
} from "@/services/clients";
import type { Client, ClientStatus } from "@/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await listClients();
  return NextResponse.json({ data });
}

type CreatePayload = { action?: "create"; data: Partial<Client> };
type UpdatePayload = { action: "update"; id: string; patch: Partial<Client> };
type StatusPayload = { action: "activate" | "deactivate"; id: string };
type PostPayload = CreatePayload | UpdatePayload | StatusPayload;

export async function POST(req: Request) {
  let body: PostPayload | { action?: string; [k: string]: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  try {
    const action = (body as { action?: string }).action;
    if (action === "update") {
      const { id, patch } = body as UpdatePayload;
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const updated = await updateClient(id, patch);
      if (!updated) return NextResponse.json({ error: "row not found" }, { status: 404 });
      return NextResponse.json({ data: updated });
    }
    if (action === "activate") {
      const { id } = body as StatusPayload;
      const updated = await activateClient(id);
      if (!updated) return NextResponse.json({ error: "row not found" }, { status: 404 });
      return NextResponse.json({ data: updated });
    }
    if (action === "deactivate") {
      const { id } = body as StatusPayload;
      const updated = await deactivateClient(id);
      if (!updated) return NextResponse.json({ error: "row not found" }, { status: 404 });
      return NextResponse.json({ data: updated });
    }
    // Default = create. Accept either { data: {...} } or top-level fields.
    const dataIn = "data" in (body as object)
      ? ((body as CreatePayload).data ?? {})
      : (body as Partial<Client>);
    if (!dataIn.clientName) {
      return NextResponse.json({ error: "clientName 필수" }, { status: 400 });
    }
    const created = await createClient({
      clientCode: dataIn.clientCode ?? "",
      clientName: dataIn.clientName ?? "",
      contactName: dataIn.contactName ?? "",
      phone: dataIn.phone ?? "",
      email: dataIn.email ?? "",
      country: dataIn.country ?? "",
      region: dataIn.region ?? "",
      address: dataIn.address ?? "",
      note: dataIn.note ?? "",
      status: (dataIn.status as ClientStatus) ?? "활성",
      unitPrice: Number(dataIn.unitPrice) || 0,
      commissionRate: Number(dataIn.commissionRate) || 0,
    });
    return NextResponse.json({ data: created });
  } catch (err) {
    type WithDetail = { detail?: { httpStatus?: number; responseBody?: string; errorMessage?: string } };
    const detail = (err as WithDetail).detail;
    return NextResponse.json({
      error: (err as Error).message ?? String(err),
      sheetName: "거래처마스터",
      appsScript: detail ?? null,
    }, { status: 500 });
  }
}

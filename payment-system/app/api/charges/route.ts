import { NextResponse } from "next/server";
import {
  listCharges, createCharge, updateCharge, deleteCharge,
  addPayment, deletePayment,
} from "@/services/charges";
import type { Charge, PaymentMethod } from "@/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ data: await listCharges() });
}

export async function POST(req: Request) {
  let body: { action?: string; [k: string]: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const action = body.action;

  if (action === "update") {
    const { id, patch } = body as { id: string; patch: Partial<Charge> };
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const updated = await updateCharge(id, patch);
    if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ data: updated });
  }
  if (action === "delete") {
    const { id } = body as { id: string };
    const ok = await deleteCharge(id);
    if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ data: { id } });
  }
  if (action === "addPayment") {
    const { id, payment } = body as {
      id: string;
      payment: { date?: string; amount: number; method?: PaymentMethod; memo?: string };
    };
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    if (!payment || !(Number(payment.amount) > 0)) {
      return NextResponse.json({ error: "수금액은 0보다 커야 합니다" }, { status: 400 });
    }
    const updated = await addPayment(id, payment);
    if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ data: updated });
  }
  if (action === "deletePayment") {
    const { id, paymentId } = body as { id: string; paymentId: string };
    const updated = await deletePayment(id, paymentId);
    if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ data: updated });
  }

  // 기본 = 생성
  const dataIn = ("data" in body ? body.data : body) as Partial<Charge>;
  if (!dataIn?.clientName?.trim()) {
    return NextResponse.json({ error: "거래처명 필수" }, { status: 400 });
  }
  if (!(Number(dataIn.amount) > 0)) {
    return NextResponse.json({ error: "청구금액은 0보다 커야 합니다" }, { status: 400 });
  }
  const created = await createCharge({
    ...dataIn, clientName: dataIn.clientName, amount: Number(dataIn.amount),
  });
  return NextResponse.json({ data: created });
}

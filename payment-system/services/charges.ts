import type { Charge, Payment, PaymentMethod } from "@/types";
import { getStore } from "./store";
import { genId, nowISO } from "@/lib/utils";

export async function listCharges(): Promise<Charge[]> {
  return getStore().charges.slice().sort((a, b) =>
    (b.chargeDate || "").localeCompare(a.chargeDate || "") ||
    (b.createdAt || "").localeCompare(a.createdAt || ""),
  );
}

export async function createCharge(
  input: Partial<Charge> & { clientName: string; amount: number },
): Promise<Charge> {
  const c: Charge = {
    id: input.id || genId("CH"),
    clientName: input.clientName.trim(),
    chargeDate: input.chargeDate || nowISO().slice(0, 10),
    title: input.title ?? "",
    amount: Number(input.amount) || 0,
    dueDate: input.dueDate ?? "",
    payments: input.payments ?? [],
    note: input.note ?? "",
    createdAt: input.createdAt || nowISO(),
  };
  getStore().charges.push(c);
  return c;
}

export async function updateCharge(
  id: string, patch: Partial<Charge>,
): Promise<Charge | null> {
  const list = getStore().charges;
  const idx = list.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  // payments 는 전용 액션으로만 변경 — 부분 patch 가 덮어쓰지 않도록 보존.
  const { payments, ...rest } = patch;
  list[idx] = {
    ...list[idx], ...rest, id, createdAt: list[idx].createdAt,
    amount: rest.amount != null ? Number(rest.amount) || 0 : list[idx].amount,
    payments: payments ?? list[idx].payments,
  };
  return list[idx];
}

export async function deleteCharge(id: string): Promise<boolean> {
  const s = getStore();
  const before = s.charges.length;
  s.charges = s.charges.filter((c) => c.id !== id);
  return s.charges.length < before;
}

export async function addPayment(
  chargeId: string,
  input: { date?: string; amount: number; method?: PaymentMethod; memo?: string },
): Promise<Charge | null> {
  const list = getStore().charges;
  const c = list.find((x) => x.id === chargeId);
  if (!c) return null;
  const p: Payment = {
    id: genId("PM"),
    date: input.date || nowISO().slice(0, 10),
    amount: Number(input.amount) || 0,
    method: input.method || "계좌이체",
    memo: input.memo ?? "",
  };
  c.payments = [...(c.payments ?? []), p];
  return c;
}

export async function deletePayment(
  chargeId: string, paymentId: string,
): Promise<Charge | null> {
  const list = getStore().charges;
  const c = list.find((x) => x.id === chargeId);
  if (!c) return null;
  c.payments = (c.payments ?? []).filter((p) => p.id !== paymentId);
  return c;
}

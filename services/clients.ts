import type { Client, ClientStatus } from "@/types";
import {
  findRowNumberByColumn,
  readRowsOrEmpty,
  SHEET_TABS,
  strictAppendRow,
  strictUpdateRow,
  useSheets,
} from "@/lib/googleSheets";
import { getStore } from "./store";
import { genId } from "@/lib/utils";

const TAB = SHEET_TABS.clients;

// User-spec sheet header — keep in sync with manual sheet creation.
export const CLIENT_HEADER = [
  "id", "clientCode", "clientName", "contactName", "phone", "email",
  "country", "region", "address", "note", "status", "createdAt", "updatedAt",
  "unitPrice", "commissionRate",
] as const;

function normalizeStatus(raw: unknown): ClientStatus {
  const s = String(raw ?? "").trim();
  if (s === "비활성" || s === "inactive" || s === "INACTIVE") return "비활성";
  return "활성";
}

function fromRow(r: Record<string, string>): Client {
  return {
    id: r.id ?? "",
    clientCode: r.clientCode ?? r["거래처코드"] ?? "",
    clientName: r.clientName ?? r["거래처명"] ?? r.customer ?? "",
    contactName: r.contactName ?? r["담당자"] ?? "",
    phone: r.phone ?? r["연락처"] ?? "",
    email: r.email ?? r["이메일"] ?? "",
    country: r.country ?? r["국가"] ?? "",
    region: r.region ?? r["지역"] ?? "",
    address: r.address ?? r["주소"] ?? "",
    note: r.note ?? r["비고"] ?? "",
    status: normalizeStatus(r.status ?? r["상태"]),
    createdAt: r.createdAt ?? r["생성일시"] ?? "",
    updatedAt: r.updatedAt ?? r["수정일시"] ?? "",
    unitPrice: Number(r.unitPrice ?? r["기본단가"] ?? r["단가"]) || 0,
    commissionRate: Number(r.commissionRate ?? r["수수료율"]) || 0,
  };
}

function toRow(c: Client): (string | number | boolean)[] {
  return [
    c.id, c.clientCode, c.clientName, c.contactName, c.phone, c.email,
    c.country, c.region, c.address, c.note, c.status, c.createdAt, c.updatedAt,
    c.unitPrice, c.commissionRate,
  ];
}

/**
 * 거래처마스터 전체 행 읽기. 시트가 없으면 [] 반환.
 * 시트 생성·헤더 추가는 사용자가 수동으로 처리합니다.
 */
export async function listClients(): Promise<Client[]> {
  if ((await useSheets())) {
    const rows = await readRowsOrEmpty<Record<string, string>>(TAB);
    return rows.map(fromRow);
  }
  return getStore().clients ?? [];
}

export async function createClient(
  input: Omit<Client, "id" | "createdAt" | "updatedAt">
    & { id?: string; createdAt?: string; updatedAt?: string },
): Promise<Client> {
  const now = new Date().toISOString();
  const c: Client = {
    id: input.id || genId("CL"),
    clientCode: input.clientCode ?? "",
    clientName: input.clientName ?? "",
    contactName: input.contactName ?? "",
    phone: input.phone ?? "",
    email: input.email ?? "",
    country: input.country ?? "",
    region: input.region ?? "",
    address: input.address ?? "",
    note: input.note ?? "",
    status: input.status ?? "활성",
    createdAt: input.createdAt || now,
    updatedAt: input.updatedAt || now,
    unitPrice: Number(input.unitPrice) || 0,
    commissionRate: Number(input.commissionRate) || 0,
  };
  if ((await useSheets())) {
    await strictAppendRow(TAB, toRow(c), [...CLIENT_HEADER]);
  } else {
    const s = getStore();
    if (!s.clients) s.clients = [];
    s.clients.push(c);
  }
  return c;
}

export async function updateClient(
  id: string,
  patch: Partial<Omit<Client, "id" | "createdAt">>,
): Promise<Client | null> {
  if ((await useSheets())) {
    const rowNum = await findRowNumberByColumn(TAB, "id", id);
    if (!rowNum) return null;
    const rows = await readRowsOrEmpty<Record<string, string>>(TAB);
    const existing = rows.map(fromRow).find((c) => c.id === id);
    if (!existing) return null;
    const merged: Client = {
      ...existing,
      ...patch,
      id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    await strictUpdateRow(TAB, rowNum, toRow(merged), [...CLIENT_HEADER]);
    return merged;
  }
  const list = getStore().clients ?? [];
  const idx = list.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  list[idx] = {
    ...list[idx],
    ...patch,
    id,
    createdAt: list[idx].createdAt,
    updatedAt: new Date().toISOString(),
  };
  return list[idx];
}

/** 거래처 비활성화 — status 토글. */
export async function deactivateClient(id: string): Promise<Client | null> {
  return updateClient(id, { status: "비활성" });
}
export async function activateClient(id: string): Promise<Client | null> {
  return updateClient(id, { status: "활성" });
}

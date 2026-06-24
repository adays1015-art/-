import type {
  BusinessDocument, DocumentLineItem, DocumentStatus, DocumentType, TaxMode,
} from "@/types";
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
import { generateDocNo, recalcDocument } from "@/lib/documentMath";

const TAB = SHEET_TABS.documents;

// 거래문서 시트 헤더 — sheetDefs 의 거래문서 정의와 동일하게 유지.
export const DOCUMENT_HEADER = [
  "id", "docType", "docNo", "issueDate", "status",
  "clientId", "clientName", "clientBizNo", "clientContact", "clientPhone", "clientAddress",
  "currency", "taxMode", "taxRate", "itemsJson",
  "subtotal", "tax", "total", "note", "createdAt", "updatedAt",
] as const;

function parseItems(raw: unknown): DocumentLineItem[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as DocumentLineItem[];
  try {
    const parsed = JSON.parse(String(raw));
    if (!Array.isArray(parsed)) return [];
    return parsed.map((it: Record<string, unknown>) => ({
      name: String(it.name ?? ""),
      spec: it.spec != null ? String(it.spec) : "",
      qty: Number(it.qty) || 0,
      unit: it.unit != null ? String(it.unit) : "",
      unitPrice: Number(it.unitPrice) || 0,
      amount: Number(it.amount) || 0,
      note: it.note != null ? String(it.note) : "",
    }));
  } catch {
    return [];
  }
}

function normType(raw: unknown): DocumentType {
  const s = String(raw ?? "").trim();
  return (["견적서", "거래명세서", "인보이스", "발주서"] as DocumentType[])
    .includes(s as DocumentType) ? (s as DocumentType) : "견적서";
}
function normStatus(raw: unknown): DocumentStatus {
  const s = String(raw ?? "").trim();
  return (["작성중", "발행", "취소"] as DocumentStatus[])
    .includes(s as DocumentStatus) ? (s as DocumentStatus) : "작성중";
}
function normTaxMode(raw: unknown): TaxMode {
  const s = String(raw ?? "").trim();
  return (["별도", "포함", "없음"] as TaxMode[])
    .includes(s as TaxMode) ? (s as TaxMode) : "별도";
}

function fromRow(r: Record<string, string>): BusinessDocument {
  const items = parseItems(r.itemsJson);
  return {
    id: r.id ?? "",
    docType: normType(r.docType),
    docNo: r.docNo ?? "",
    issueDate: r.issueDate ?? "",
    status: normStatus(r.status),
    clientId: r.clientId ?? "",
    clientName: r.clientName ?? "",
    clientBizNo: r.clientBizNo ?? "",
    clientContact: r.clientContact ?? "",
    clientPhone: r.clientPhone ?? "",
    clientAddress: r.clientAddress ?? "",
    currency: r.currency || "KRW",
    taxMode: normTaxMode(r.taxMode),
    taxRate: Number(r.taxRate) || 0,
    items,
    subtotal: Number(r.subtotal) || 0,
    tax: Number(r.tax) || 0,
    total: Number(r.total) || 0,
    note: r.note ?? "",
    createdAt: r.createdAt ?? "",
    updatedAt: r.updatedAt ?? "",
  };
}

function toRow(d: BusinessDocument): (string | number | boolean)[] {
  return [
    d.id, d.docType, d.docNo, d.issueDate, d.status,
    d.clientId ?? "", d.clientName, d.clientBizNo ?? "", d.clientContact ?? "",
    d.clientPhone ?? "", d.clientAddress ?? "",
    d.currency, d.taxMode, d.taxRate, JSON.stringify(d.items ?? []),
    d.subtotal, d.tax, d.total, d.note, d.createdAt, d.updatedAt,
  ];
}

/** 거래문서 전체 읽기. 최신 작성일 우선 정렬. */
export async function listDocuments(): Promise<BusinessDocument[]> {
  let docs: BusinessDocument[];
  if (await useSheets()) {
    const rows = await readRowsOrEmpty<Record<string, string>>(TAB);
    docs = rows.map(fromRow);
  } else {
    docs = getStore().documents ?? [];
  }
  return docs.slice().sort((a, b) =>
    (b.issueDate || "").localeCompare(a.issueDate || "") ||
    (b.createdAt || "").localeCompare(a.createdAt || ""),
  );
}

type DocumentInput = Partial<Omit<BusinessDocument, "id" | "createdAt" | "updatedAt">>
  & { docType: DocumentType };

function buildDocument(
  input: DocumentInput,
  existing: BusinessDocument | null,
  existingDocNos: string[],
): BusinessDocument {
  const now = new Date().toISOString();
  const issueDate = input.issueDate
    ?? existing?.issueDate
    ?? now.slice(0, 10);
  const docType = input.docType ?? existing?.docType ?? "견적서";
  const base: BusinessDocument = {
    id: existing?.id ?? genId("DOC"),
    docType,
    docNo: input.docNo || existing?.docNo
      || generateDocNo(docType, issueDate, existingDocNos),
    issueDate,
    status: input.status ?? existing?.status ?? "작성중",
    clientId: input.clientId ?? existing?.clientId ?? "",
    clientName: input.clientName ?? existing?.clientName ?? "",
    clientBizNo: input.clientBizNo ?? existing?.clientBizNo ?? "",
    clientContact: input.clientContact ?? existing?.clientContact ?? "",
    clientPhone: input.clientPhone ?? existing?.clientPhone ?? "",
    clientAddress: input.clientAddress ?? existing?.clientAddress ?? "",
    currency: input.currency ?? existing?.currency ?? "KRW",
    taxMode: input.taxMode ?? existing?.taxMode ?? "별도",
    taxRate: input.taxRate ?? existing?.taxRate ?? 10,
    items: (input.items ?? existing?.items ?? []) as DocumentLineItem[],
    subtotal: 0, tax: 0, total: 0,
    note: input.note ?? existing?.note ?? "",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  // 합계·라인 금액은 항상 서버에서 재계산해 신뢰값으로 저장.
  return recalcDocument(base);
}

export async function createDocument(input: DocumentInput): Promise<BusinessDocument> {
  if (await useSheets()) {
    const rows = await readRowsOrEmpty<Record<string, string>>(TAB);
    const existingDocNos = rows.map((r) => r.docNo ?? "");
    const doc = buildDocument(input, null, existingDocNos);
    await strictAppendRow(TAB, toRow(doc), [...DOCUMENT_HEADER]);
    return doc;
  }
  const s = getStore();
  if (!s.documents) s.documents = [];
  const doc = buildDocument(input, null, s.documents.map((d) => d.docNo));
  s.documents.push(doc);
  return doc;
}

export async function updateDocument(
  id: string,
  patch: Partial<BusinessDocument>,
): Promise<BusinessDocument | null> {
  if (await useSheets()) {
    const rowNum = await findRowNumberByColumn(TAB, "id", id);
    if (!rowNum) return null;
    const rows = await readRowsOrEmpty<Record<string, string>>(TAB);
    const existing = rows.map(fromRow).find((d) => d.id === id);
    if (!existing) return null;
    const merged = buildDocument(
      { ...existing, ...patch, docType: patch.docType ?? existing.docType },
      existing,
      rows.map((r) => r.docNo ?? ""),
    );
    await strictUpdateRow(TAB, rowNum, toRow(merged), [...DOCUMENT_HEADER]);
    return merged;
  }
  const list = getStore().documents ?? [];
  const idx = list.findIndex((d) => d.id === id);
  if (idx === -1) return null;
  const merged = buildDocument(
    { ...list[idx], ...patch, docType: patch.docType ?? list[idx].docType },
    list[idx],
    list.map((d) => d.docNo),
  );
  list[idx] = merged;
  return merged;
}

/** 상태 변경(발행/취소/작성중). 행 삭제 대신 소프트 처리. */
export async function setDocumentStatus(
  id: string,
  status: DocumentStatus,
): Promise<BusinessDocument | null> {
  return updateDocument(id, { status });
}

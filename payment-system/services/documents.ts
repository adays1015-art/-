import type { BusinessDocument, DocumentLineItem, DocumentStatus, DocumentType } from "@/types";
import { getStore } from "./store";
import { genId, nowISO, todayISO } from "@/lib/utils";
import { generateDocNo, recalcDocument } from "@/lib/documentMath";

export async function listDocuments(): Promise<BusinessDocument[]> {
  return getStore().documents.slice().sort((a, b) =>
    (b.issueDate || "").localeCompare(a.issueDate || "") ||
    (b.createdAt || "").localeCompare(a.createdAt || ""),
  );
}

type DocInput = Partial<Omit<BusinessDocument, "id" | "createdAt" | "updatedAt">>
  & { docType: DocumentType };

function build(
  input: DocInput, existing: BusinessDocument | null, existingDocNos: string[],
): BusinessDocument {
  const now = nowISO();
  const issueDate = input.issueDate ?? existing?.issueDate ?? todayISO();
  const docType = input.docType ?? existing?.docType ?? "견적서";
  const base: BusinessDocument = {
    id: existing?.id ?? genId("DOC"),
    docType,
    docNo: input.docNo || existing?.docNo || generateDocNo(docType, issueDate, existingDocNos),
    issueDate,
    status: input.status ?? existing?.status ?? "작성중",
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
  return recalcDocument(base);
}

export async function createDocument(input: DocInput): Promise<BusinessDocument> {
  const s = getStore();
  const doc = build(input, null, s.documents.map((d) => d.docNo));
  s.documents.push(doc);
  return doc;
}

export async function updateDocument(
  id: string, patch: Partial<BusinessDocument>,
): Promise<BusinessDocument | null> {
  const list = getStore().documents;
  const idx = list.findIndex((d) => d.id === id);
  if (idx === -1) return null;
  list[idx] = build(
    { ...list[idx], ...patch, docType: patch.docType ?? list[idx].docType },
    list[idx],
    list.map((d) => d.docNo),
  );
  return list[idx];
}

export async function setDocumentStatus(
  id: string, status: DocumentStatus,
): Promise<BusinessDocument | null> {
  return updateDocument(id, { status });
}

export async function deleteDocument(id: string): Promise<boolean> {
  const s = getStore();
  const before = s.documents.length;
  s.documents = s.documents.filter((d) => d.id !== id);
  return s.documents.length < before;
}

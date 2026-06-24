import { NextResponse } from "next/server";
import {
  listDocuments, createDocument, updateDocument, setDocumentStatus, deleteDocument,
} from "@/services/documents";
import type { BusinessDocument, DocumentStatus } from "@/types";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ data: await listDocuments() });
}

export async function POST(req: Request) {
  let body: { action?: string; [k: string]: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const action = body.action;

  if (action === "update") {
    const { id, patch } = body as { id: string; patch: Partial<BusinessDocument> };
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const updated = await updateDocument(id, patch);
    if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ data: updated });
  }
  if (action === "status") {
    const { id, status } = body as { id: string; status: DocumentStatus };
    if (!id || !status) return NextResponse.json({ error: "id, status 필수" }, { status: 400 });
    const updated = await setDocumentStatus(id, status);
    if (!updated) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ data: updated });
  }
  if (action === "delete") {
    const { id } = body as { id: string };
    const ok = await deleteDocument(id);
    if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ data: { id } });
  }

  // 기본 = 생성
  const dataIn = ("data" in body ? body.data : body) as Partial<BusinessDocument>;
  if (!dataIn?.docType) return NextResponse.json({ error: "docType 필수" }, { status: 400 });
  if (!dataIn?.clientName?.trim()) return NextResponse.json({ error: "거래처명 필수" }, { status: 400 });
  const created = await createDocument({ ...dataIn, docType: dataIn.docType });
  return NextResponse.json({ data: created });
}

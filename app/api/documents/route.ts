import { NextResponse } from "next/server";
import {
  listDocuments, createDocument, updateDocument, setDocumentStatus,
} from "@/services/documents";
import type { BusinessDocument, DocumentStatus } from "@/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await listDocuments();
  return NextResponse.json({ data });
}

type CreatePayload = { action?: "create"; data: Partial<BusinessDocument> };
type UpdatePayload = { action: "update"; id: string; patch: Partial<BusinessDocument> };
type StatusPayload = { action: "status"; id: string; status: DocumentStatus };

export async function POST(req: Request) {
  let body: { action?: string; [k: string]: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  try {
    const action = body.action;

    if (action === "update") {
      const { id, patch } = body as unknown as UpdatePayload;
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const updated = await updateDocument(id, patch);
      if (!updated) return NextResponse.json({ error: "row not found" }, { status: 404 });
      return NextResponse.json({ data: updated });
    }

    if (action === "status") {
      const { id, status } = body as unknown as StatusPayload;
      if (!id || !status) return NextResponse.json({ error: "id, status 필수" }, { status: 400 });
      const updated = await setDocumentStatus(id, status);
      if (!updated) return NextResponse.json({ error: "row not found" }, { status: 404 });
      return NextResponse.json({ data: updated });
    }

    // Default = create.
    const dataIn = "data" in body
      ? ((body as CreatePayload).data ?? {})
      : (body as Partial<BusinessDocument>);
    if (!dataIn.docType) {
      return NextResponse.json({ error: "docType 필수" }, { status: 400 });
    }
    if (!dataIn.clientName) {
      return NextResponse.json({ error: "거래처명(clientName) 필수" }, { status: 400 });
    }
    const created = await createDocument({ ...dataIn, docType: dataIn.docType });
    return NextResponse.json({ data: created });
  } catch (err) {
    type WithDetail = { detail?: { httpStatus?: number; responseBody?: string; errorMessage?: string } };
    const detail = (err as WithDetail).detail;
    return NextResponse.json({
      error: (err as Error).message ?? String(err),
      sheetName: "거래문서",
      appsScript: detail ?? null,
    }, { status: 500 });
  }
}

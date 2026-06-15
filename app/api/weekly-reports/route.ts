import { NextResponse } from "next/server";
import {
  listWeeklyReports, createWeeklyReport,
  updateWeeklyReport, deleteWeeklyReport,
} from "@/services/weeklyReports";
import type { WeeklyReport, WeeklyReportStatus } from "@/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await listWeeklyReports();
  return NextResponse.json({ data });
}

type CreatePayload = { action?: "create"; data: Partial<WeeklyReport> };
type UpdatePayload = { action: "update"; id: string; patch: Partial<WeeklyReport> };
type DeletePayload = { action: "delete"; id: string };
type PostPayload = CreatePayload | UpdatePayload | DeletePayload;

export async function POST(req: Request) {
  let body: PostPayload | { action?: string; [k: string]: unknown };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  try {
    const action = (body as { action?: string }).action;
    if (action === "update") {
      const { id, patch } = body as UpdatePayload;
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const updated = await updateWeeklyReport(id, patch);
      if (!updated) return NextResponse.json({ error: "row not found" }, { status: 404 });
      return NextResponse.json({ data: updated });
    }
    if (action === "delete") {
      const { id } = body as DeletePayload;
      if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
      const deleted = await deleteWeeklyReport(id);
      if (!deleted) return NextResponse.json({ error: "row not found" }, { status: 404 });
      return NextResponse.json({ data: deleted });
    }
    // Default = create. Accept either { data: {...} } or top-level fields.
    const dataIn = "data" in (body as object)
      ? ((body as CreatePayload).data ?? {})
      : (body as Partial<WeeklyReport>);
    if (!dataIn.author || !String(dataIn.author).trim()) {
      return NextResponse.json({ error: "author(작성자) 필수" }, { status: 400 });
    }
    if (!dataIn.weekStart) {
      return NextResponse.json({ error: "weekStart(주 시작일) 필수" }, { status: 400 });
    }
    const created = await createWeeklyReport({
      weekStart: dataIn.weekStart ?? "",
      weekEnd: dataIn.weekEnd ?? "",
      author: dataIn.author ?? "",
      department: dataIn.department ?? "",
      thisWeek: dataIn.thisWeek ?? "",
      nextWeek: dataIn.nextWeek ?? "",
      issues: dataIn.issues ?? "",
      note: dataIn.note ?? "",
      status: (dataIn.status as WeeklyReportStatus) ?? "작성중",
    });
    return NextResponse.json({ data: created });
  } catch (err) {
    type WithDetail = { detail?: { httpStatus?: number; responseBody?: string; errorMessage?: string } };
    const detail = (err as WithDetail).detail;
    return NextResponse.json({
      error: (err as Error).message ?? String(err),
      sheetName: "주간작업보고",
      appsScript: detail ?? null,
    }, { status: 500 });
  }
}

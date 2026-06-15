import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  listReports, createReport, updateReport, deleteReport,
} from "@/lib/store";
import { AUTH_COOKIE, verifySession } from "@/lib/auth";
import type { WeeklyReport, ReportStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await listReports();
  return NextResponse.json({ data });
}

export async function POST(req: Request) {
  const session = verifySession(cookies().get(AUTH_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  let body: { action?: string; id?: string; data?: Partial<WeeklyReport>; patch?: Partial<WeeklyReport> };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "잘못된 요청 형식입니다." }, { status: 400 }); }

  try {
    const action = body.action ?? "create";

    if (action === "update") {
      if (!body.id) return NextResponse.json({ error: "id 필요" }, { status: 400 });
      const updated = await updateReport(body.id, body.patch ?? {});
      if (!updated) return NextResponse.json({ error: "보고를 찾을 수 없습니다." }, { status: 404 });
      return NextResponse.json({ data: updated });
    }

    if (action === "confirm") {
      if (session.role !== "관리자") return NextResponse.json({ error: "관리자만 확인할 수 있습니다." }, { status: 403 });
      if (!body.id) return NextResponse.json({ error: "id 필요" }, { status: 400 });
      const updated = await updateReport(body.id, {
        status: "확인됨",
        managerNote: body.patch?.managerNote ?? "",
      });
      if (!updated) return NextResponse.json({ error: "보고를 찾을 수 없습니다." }, { status: 404 });
      return NextResponse.json({ data: updated });
    }

    if (action === "delete") {
      if (!body.id) return NextResponse.json({ error: "id 필요" }, { status: 400 });
      const ok = await deleteReport(body.id);
      if (!ok) return NextResponse.json({ error: "Sheets 모드에선 삭제 대신 수정만 가능합니다." }, { status: 400 });
      return NextResponse.json({ ok: true });
    }

    // create
    const d = body.data ?? {};
    const author = String(d.author ?? session.name).trim();
    if (!author) return NextResponse.json({ error: "작성자가 필요합니다." }, { status: 400 });
    if (!d.weekStart) return NextResponse.json({ error: "대상 주간이 필요합니다." }, { status: 400 });
    const created = await createReport({
      weekStart: d.weekStart ?? "",
      weekEnd: d.weekEnd ?? "",
      team: String(d.team ?? session.team).trim(),
      author,
      thisWeek: d.thisWeek ?? "",
      activities: Array.isArray(d.activities) ? d.activities : [],
      nextWeek: d.nextWeek ?? "",
      issues: d.issues ?? "",
      status: (d.status as ReportStatus) ?? "제출",
    });
    return NextResponse.json({ data: created });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message ?? String(err) }, { status: 500 });
  }
}

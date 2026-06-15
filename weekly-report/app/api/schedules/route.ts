import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  listSchedules, createSchedule, updateSchedule, deleteSchedule,
} from "@/lib/store";
import { AUTH_COOKIE, verifySession } from "@/lib/auth";
import type { Schedule } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await listSchedules();
  return NextResponse.json({ data });
}

export async function POST(req: Request) {
  const session = verifySession(cookies().get(AUTH_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  let body: { action?: string; id?: string; data?: Partial<Schedule>; patch?: Partial<Schedule> };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "잘못된 요청 형식입니다." }, { status: 400 }); }

  try {
    const action = body.action ?? "create";

    if (action === "update") {
      if (!body.id) return NextResponse.json({ error: "id 필요" }, { status: 400 });
      const updated = await updateSchedule(body.id, body.patch ?? {});
      if (!updated) return NextResponse.json({ error: "일정을 찾을 수 없습니다." }, { status: 404 });
      return NextResponse.json({ data: updated });
    }

    if (action === "delete") {
      if (!body.id) return NextResponse.json({ error: "id 필요" }, { status: 400 });
      const ok = await deleteSchedule(body.id);
      if (!ok) return NextResponse.json({ error: "일정을 찾을 수 없습니다." }, { status: 404 });
      return NextResponse.json({ ok: true });
    }

    // create
    const d = body.data ?? {};
    if (!d.title || !String(d.title).trim()) {
      return NextResponse.json({ error: "제목은 필수입니다." }, { status: 400 });
    }
    if (!d.startDate) {
      return NextResponse.json({ error: "날짜는 필수입니다." }, { status: 400 });
    }
    const created = await createSchedule({
      startDate: d.startDate,
      endDate: d.endDate || d.startDate,
      title: String(d.title).trim(),
      assignee: d.assignee ?? "",
      category: d.category ?? "",
      urgent: !!d.urgent,
    });
    return NextResponse.json({ data: created });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message ?? String(err) }, { status: 500 });
  }
}

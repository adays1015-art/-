import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { listExpenses, createExpense, updateExpense } from "@/lib/store";
import { AUTH_COOKIE, verifySession } from "@/lib/auth";
import type { ExpenseRequest, ExpenseStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  const data = await listExpenses();
  return NextResponse.json({ data });
}

export async function POST(req: Request) {
  const session = verifySession(cookies().get(AUTH_COOKIE)?.value);
  if (!session) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  let body: { action?: string; id?: string; data?: Partial<ExpenseRequest>; patch?: Partial<ExpenseRequest> };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "잘못된 요청 형식입니다." }, { status: 400 }); }

  try {
    const action = body.action ?? "create";

    if (action === "update" || action === "decide") {
      if (action === "decide" && session.role !== "관리자") {
        return NextResponse.json({ error: "관리자만 결재할 수 있습니다." }, { status: 403 });
      }
      if (!body.id) return NextResponse.json({ error: "id 필요" }, { status: 400 });
      const updated = await updateExpense(body.id, body.patch ?? {});
      if (!updated) return NextResponse.json({ error: "요청을 찾을 수 없습니다." }, { status: 404 });
      return NextResponse.json({ data: updated });
    }

    // create
    const d = body.data ?? {};
    if (!d.item || !String(d.item).trim()) {
      return NextResponse.json({ error: "품목/자재명은 필수입니다." }, { status: 400 });
    }
    const created = await createExpense({
      date: d.date || new Date().toISOString().slice(0, 10),
      team: String(d.team ?? session.team).trim(),
      requester: String(d.requester ?? session.name).trim(),
      item: String(d.item).trim(),
      qty: d.qty ?? "",
      amount: Number(d.amount) || 0,
      vendor: d.vendor ?? "",
      reason: d.reason ?? "",
      status: (d.status as ExpenseStatus) ?? "요청",
    });
    return NextResponse.json({ data: created });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message ?? String(err) }, { status: 500 });
  }
}

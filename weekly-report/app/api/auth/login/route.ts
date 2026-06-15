import { NextResponse } from "next/server";
import { AUTH_COOKIE, signSession, verifyPassword, isRole } from "@/lib/auth";
import type { Session } from "@/lib/types";

export async function POST(req: Request) {
  let body: { password?: string; role?: string; name?: string; team?: string };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "잘못된 요청" }, { status: 400 }); }

  if (!verifyPassword(String(body.password ?? ""))) {
    return NextResponse.json({ error: "비밀번호가 올바르지 않습니다." }, { status: 401 });
  }
  const role = isRole(body.role) ? body.role : "팀원";
  const name = role === "관리자" ? (String(body.name ?? "").trim() || "관리자") : String(body.name ?? "").trim();
  const team = role === "관리자" ? (String(body.team ?? "").trim() || "전체") : String(body.team ?? "").trim();

  if (role === "팀원" && !name) {
    return NextResponse.json({ error: "이름을 입력/선택하세요." }, { status: 400 });
  }

  const session: Session = { role, name, team };
  const res = NextResponse.json({ ok: true, session });
  res.cookies.set(AUTH_COOKIE, signSession(session), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}

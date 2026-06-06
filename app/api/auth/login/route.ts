import { NextResponse } from "next/server";
import { APP_AUTH_COOKIE, ROLES, signCookie, verifyPassword, type Role } from "@/lib/appAuth";

export async function POST(req: Request) {
  let body: { password?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "잘못된 요청 형식입니다." }, { status: 400 });
  }
  const password = String(body.password ?? "");
  const role = String(body.role ?? "");

  if (!ROLES.includes(role as Role)) {
    return NextResponse.json({ ok: false, error: "역할을 선택하세요." }, { status: 400 });
  }
  if (!verifyPassword(password)) {
    return NextResponse.json({ ok: false, error: "비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  const value = signCookie(role as Role);
  const res = NextResponse.json({ ok: true, role });
  res.cookies.set(APP_AUTH_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    // 7 days
    maxAge: 60 * 60 * 24 * 7,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}

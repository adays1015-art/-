import { NextResponse } from "next/server";
import { APP_AUTH_COOKIE } from "@/lib/appAuth";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(APP_AUTH_COOKIE, "", {
    httpOnly: true, sameSite: "lax", path: "/",
    maxAge: 0,
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}

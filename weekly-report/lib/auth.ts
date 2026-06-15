// 공용 비밀번호 + 이름/팀 기반 간단 인증 (서버 전용).
// 비밀번호 1개로 들어오고, 역할(관리자/팀원)·이름·팀을 HMAC 서명 쿠키에 담는다.

import { createHmac, timingSafeEqual } from "crypto";
import type { Role, Session } from "./types";
import { AUTH_COOKIE } from "./authConst";

export { AUTH_COOKIE };

export function getPassword(): string {
  return (process.env.WR_PASSWORD ?? "").trim() || "bfter1234";
}

function secret(): string {
  return (process.env.WR_SECRET ?? "wr-dev-secret") + "|" + getPassword();
}

export function verifyPassword(input: string): boolean {
  const expected = Buffer.from(getPassword(), "utf8");
  const given = Buffer.from(input ?? "", "utf8");
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

export function signSession(s: Session): string {
  const payload = Buffer.from(JSON.stringify(s), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifySession(cookie: string | undefined | null): Session | null {
  if (!cookie) return null;
  const dot = cookie.lastIndexOf(".");
  if (dot < 1) return null;
  const payload = cookie.slice(0, dot);
  const sig = cookie.slice(dot + 1);
  const expected = createHmac("sha256", secret()).update(payload).digest("hex");
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))) return null;
  try {
    const s = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Session;
    if (s.role !== "관리자" && s.role !== "팀원") return null;
    return s;
  } catch { return null; }
}

export function isRole(r: unknown): r is Role {
  return r === "관리자" || r === "팀원";
}

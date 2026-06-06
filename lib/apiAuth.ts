/**
 * Server-side role gate for API route handlers.
 *
 *   import { requireRole } from "@/lib/apiAuth";
 *
 *   export async function POST(req: Request) {
 *     const gate = requireRole("bom");
 *     if (!gate.ok) return gate.res;
 *     …
 *   }
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { APP_AUTH_COOKIE, verifyCookie, canEdit, type Area, type Role } from "./appAuth";

export type GateResult =
  | { ok: true; role: Role }
  | { ok: false; res: NextResponse };

export function requireRole(area: Area): GateResult {
  const cookie = cookies().get(APP_AUTH_COOKIE)?.value;
  const sess = verifyCookie(cookie);
  if (!sess) {
    return { ok: false, res: NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 }) };
  }
  if (!canEdit(sess.role, area)) {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: `접근 권한이 없습니다. (현재 역할: ${sess.role})` }, { status: 403 }),
    };
  }
  return { ok: true, role: sess.role };
}

/** Read current role without enforcing anything. Returns null if not logged in. */
export function currentRole(): Role | null {
  const cookie = cookies().get(APP_AUTH_COOKIE)?.value;
  return verifyCookie(cookie)?.role ?? null;
}

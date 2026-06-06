/**
 * Stage-1 internal access control — server side only.
 *
 *   - Single password (env APP_PASSWORD, default "anotherday123" for local dev)
 *   - HMAC-signed cookie carrying the chosen role
 *
 * Uses Node's crypto — NEVER import this from client components. Use
 * `@/lib/roles` for client-safe role types and permission helpers.
 */

import { createHmac, timingSafeEqual } from "crypto";

export { ROLES, ROLE_ABBR, canEdit, canAccess } from "./roles";
export type { Role, Area } from "./roles";
import type { Role } from "./roles";
import { ROLES } from "./roles";

export const APP_AUTH_COOKIE = "bfter-app-auth";

export function getAppPassword(): string {
  // Trim so that `echo password | vercel env add ...` (which pipes a trailing
  // newline) doesn't make the saved password unmatchable.
  return (process.env.APP_PASSWORD ?? "").trim() || "anotherday123";
}

function secret(): string {
  return (process.env.NEXTAUTH_SECRET ?? "") + "|" + getAppPassword();
}

export function verifyPassword(input: string): boolean {
  const expected = Buffer.from(getAppPassword(), "utf8");
  const given = Buffer.from(input ?? "", "utf8");
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}

export function signCookie(role: Role): string {
  if (!ROLES.includes(role)) throw new Error("Invalid role");
  const payload = `${role}|${Date.now()}`;
  const sig = createHmac("sha256", secret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifyCookie(signed: string | undefined | null): { role: Role; ts: number } | null {
  if (!signed) return null;
  const lastDot = signed.lastIndexOf(".");
  if (lastDot < 1) return null;
  const payload = signed.slice(0, lastDot);
  const sig = signed.slice(lastDot + 1);
  const expected = createHmac("sha256", secret()).update(payload).digest("hex");
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))) return null;
  const [role, tsStr] = payload.split("|");
  if (!ROLES.includes(role as Role)) return null;
  return { role: role as Role, ts: Number(tsStr) || 0 };
}

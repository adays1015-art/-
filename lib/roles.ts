/**
 * Client-safe role definitions and permission helpers.
 * No Node dependencies — safe to import from client components.
 */

export type Role = "관리자" | "생산팀" | "조회자";
export const ROLES: Role[] = ["관리자", "생산팀", "조회자"];

export type Area =
  | "settings"
  | "bom" | "cost" | "materials" | "items" | "set-options"
  | "item-production" | "set-assembly" | "shipment"
  // 업사이클링 라인
  | "upcycle-materials" | "upcycle-items" | "upcycle-bom" | "upcycle-production"
  | "test-results"
  | "delete";

export function canEdit(role: Role | null, area: Area): boolean {
  if (!role) return false;
  if (role === "관리자") return true;
  if (role === "조회자") return false;
  // 생산팀 — 품목 생산과 동일하게 업사이클 생산도 편집 가능
  return area === "item-production" || area === "set-assembly" || area === "shipment"
    || area === "upcycle-production" || area === "test-results";
}

export function canAccess(role: Role | null, path: string): boolean {
  if (!role) return false;
  if (role === "관리자") return true;
  if (path.startsWith("/settings/")) return false;
  return true;
}

export const ROLE_ABBR: Record<Role, string> = {
  "관리자": "ADMIN",
  "생산팀": "PROD",
  "조회자": "VIEW",
};

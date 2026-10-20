import type { Dataset, Remnant, RemnantStatus } from "./types";
import { generateDataset, SEED_NOW } from "./seed";

// 데이터 접근 계층. 지금은 인메모리 샘플 데이터 모드이고,
// PostgreSQL(db/schema.sql) 연결 시 이 파일의 함수 구현만 교체한다 — 화면·KPI 코드는 그대로.

let cache: Dataset | null = null;

export function getDataset(): Dataset {
  if (!cache) cache = generateDataset();
  return cache;
}

export const isSampleMode = true;

// 샘플 데이터는 고정 시점 기준으로 만들어지므로 "현재"도 그 시점으로 맞춘다.
export function now(): number {
  return isSampleMode ? SEED_NOW.getTime() : Date.now();
}

export interface RemnantFilter {
  status?: RemnantStatus | "all";
  material?: string;
  thickness?: number;
  q?: string;
  sort?: "newest" | "oldest";
}

export function listRemnants(f: RemnantFilter = {}): Remnant[] {
  const q = f.q?.trim().toLowerCase();
  return getDataset()
    .remnants.filter((r) =>
      (!f.status || f.status === "all" || r.status === f.status) &&
      (!f.material || r.material === f.material) &&
      (!f.thickness || r.thicknessMm === f.thickness) &&
      (!q || r.engravedId.toLowerCase().includes(q) || r.rack.toLowerCase().includes(q)))
    .sort((a, b) => (f.sort === "oldest" ? 1 : -1) * a.createdAt.localeCompare(b.createdAt));
}

export function getRemnant(id: string) {
  const ds = getDataset();
  const remnant = ds.remnants.find((r) => r.id === id);
  if (!remnant) return null;
  return {
    remnant,
    parent: remnant.parentId ? ds.remnants.find((r) => r.id === remnant.parentId) ?? null : null,
    children: ds.remnants.filter((r) => r.parentId === id),
    inference: ds.inferences.find((i) => i.remnantId === id) ?? null,
  };
}

export interface InventoryRow {
  material: string;
  thicknessMm: number;
  count: number;
  areaM2: number;
  weightKg: number;
}

// 가용 잔재 재고 — 재질·두께별
export function inventory(): InventoryRow[] {
  const rows = new Map<string, InventoryRow>();
  for (const r of getDataset().remnants) {
    if (r.status !== "available") continue;
    const k = `${r.material}|${r.thicknessMm}`;
    const row = rows.get(k) ?? { material: r.material, thicknessMm: r.thicknessMm, count: 0, areaM2: 0, weightKg: 0 };
    row.count += 1;
    row.areaM2 += r.areaMm2 / 1e6;
    row.weightKg += r.weightKg;
    rows.set(k, row);
  }
  return Array.from(rows.values()).sort((a, b) => a.material.localeCompare(b.material) || a.thicknessMm - b.thicknessMm);
}

export function ageDays(r: Remnant): number {
  return Math.floor((now() - Date.parse(r.createdAt)) / 86_400_000);
}

// 장기 보관 잔재 — 우선 사용 대상
export function longStored(minDays = 45): Remnant[] {
  return getDataset()
    .remnants.filter((r) => r.status === "available" && ageDays(r) >= minDays)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function materials(): string[] {
  return Array.from(new Set(getDataset().remnants.map((r) => r.material))).sort();
}

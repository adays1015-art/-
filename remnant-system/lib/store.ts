import type { Dataset, Point, Remnant, RemnantStatus } from "./types";
import { generateDataset } from "./seed";
import { bbox, netArea, steelWeightKg } from "./geometry";
import { kstParts } from "./time";

// 데이터 접근 계층. 지금은 인메모리 샘플 데이터 모드이고,
// PostgreSQL(db/schema.sql) 연결 시 이 파일의 함수 구현만 교체한다 — 화면·KPI 코드는 그대로.

let cache: Dataset | null = null;

export function getDataset(): Dataset {
  if (!cache) cache = generateDataset();
  return cache;
}

export const isSampleMode = true;

export function now(): number {
  return Date.now();
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

export interface NewRemnantInput {
  engravedId: string;
  material: string;
  thicknessMm: number;
  outline: Point[];   // mm, 원점 (0,0) 기준
  rack: string;
  photo?: string | null;
}

export class InputError extends Error {}

// 작업자 등록 — 지금은 AI 인식 전 단계라 source = manual.
// 샘플 모드에서는 서버 메모리에만 저장된다 (서버 재시작 시 사라짐).
export function addRemnant(input: NewRemnantInput): Remnant {
  const ds = getDataset();
  const engravedId = input.engravedId.trim();
  if (!engravedId) throw new InputError("각인 ID를 입력하세요.");
  if (ds.remnants.some((r) => r.engravedId === engravedId)) throw new InputError(`이미 등록된 각인 ID입니다: ${engravedId}`);
  if (!input.material) throw new InputError("재질을 선택하세요.");
  if (!(input.thicknessMm > 0 && input.thicknessMm <= 200)) throw new InputError("두께는 0~200mm 사이여야 합니다.");
  if (input.outline.length < 3) throw new InputError("외곽선 꼭짓점이 3개 이상 필요합니다.");
  const b = bbox(input.outline);
  if (b.width <= 0 || b.height <= 0 || b.width > 12000 || b.height > 12000) throw new InputError("잔재 크기가 올바르지 않습니다.");
  const areaMm2 = Math.round(netArea(input.outline, []));
  if (areaMm2 <= 0) throw new InputError("외곽선 면적이 0입니다.");

  const r: Remnant = {
    id: `rm-u${Date.now().toString(36)}`,
    tenantId: "daelim",
    siteId: "busan-main",
    engravedId,
    material: input.material,
    thicknessMm: input.thicknessMm,
    outline: input.outline,
    holes: [],
    areaMm2,
    weightKg: Math.round(steelWeightKg(areaMm2, input.thicknessMm) * 10) / 10,
    status: "available",
    parentId: null,
    rack: input.rack.trim() || "미지정",
    source: "manual",
    createdAt: new Date().toISOString(),
    closedAt: null,
    scrapReason: null,
    photo: input.photo ?? null,
  };
  ds.remnants.push(r);
  return r;
}

// 오늘 날짜 기반 각인 ID 제안 (DL + YYMMDD + 일련번호)
export function suggestEngravedId(): string {
  const p = kstParts(Date.now());
  const day = `${String(p.y).slice(2)}${String(p.m).padStart(2, "0")}${String(p.d).padStart(2, "0")}`;
  const prefix = `DL${day}-`;
  const used = getDataset().remnants.filter((r) => r.engravedId.startsWith(prefix)).length;
  return `${prefix}${String(9001 + used).padStart(4, "0")}`;
}

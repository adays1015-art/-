import type { MaterialCategory } from "@/types";

/**
 * Canonical unit options for 원료재고 / 원료입출고 forms.
 *
 *   value = stored in the sheet
 *   label = Korean short name
 *   long  = full Korean reading (tooltip / helper)
 *
 * Legacy free-text values are preserved on read — UI components should
 * splice the row's existing unit at the top of the option list if it
 * isn't already one of these canonical values.
 */
export interface UnitOption {
  value: string;
  label: string;
  long: string;
}

export const UNIT_OPTIONS: UnitOption[] = [
  { value: "g",  label: "g",  long: "그램" },
  { value: "kg", label: "kg", long: "킬로그램" },
  { value: "ml", label: "ml", long: "밀리리터" },
  { value: "L",  label: "L",  long: "리터" },
  { value: "개", label: "개", long: "개" },
  { value: "장", label: "장", long: "장" },
];

/** Returns the canonical options plus the current value as a fallback option
 *  (at the bottom, tagged "(기존)") when it doesn't match any canonical entry.
 *  This lets legacy free-text units keep displaying without breaking the
 *  controlled-select binding. Empty strings are skipped — they fall to the
 *  placeholder option that callers render. */
export function optionsWithLegacy(currentValue: string | undefined): UnitOption[] {
  const v = (currentValue ?? "").trim();
  if (!v) return UNIT_OPTIONS;
  if (UNIT_OPTIONS.some((o) => o.value === v)) return UNIT_OPTIONS;
  return [...UNIT_OPTIONS, { value: v, label: `${v} (기존)`, long: v }];
}

/** Display-only conversion note. Returns "1kg = 1000g" / "1L = 1000ml"
 *  when the chosen unit suggests it might confuse users; empty otherwise. */
export function unitHelperText(unit: string | undefined): string {
  const v = (unit ?? "").trim();
  if (v === "kg") return "1kg = 1000g (단가는 kg당)";
  if (v === "L")  return "1L = 1000ml (단가는 L당)";
  if (v === "g")  return "단가는 g당";
  if (v === "ml") return "단가는 ml당";
  return "";
}

/**
 * Normalize a purchase price + capacity + purchase-unit triple into a
 * production-friendly unit cost. Production code reads `unitCost` paired
 * with `costUnit` — for mass and volume units we collapse to g and ml so
 * BOM math (which works in g/ml) stays consistent regardless of how the
 * purchase was logged.
 *
 *   kg → g (×1000)
 *   L  → ml (×1000)
 *   g, ml, 개, 장, others — pass through unchanged.
 *
 * Returns { unitCost, costUnit, normalizedCapacity } where unitCost is
 * Math.round(unitPrice / normalizedCapacity). Rounds to whole won.
 */
export interface NormalizedCost {
  unitCost: number;
  costUnit: string;
  normalizedCapacity: number;
}

/**
 * Map any user-typed or legacy unit label to its canonical short form.
 *
 *   g  ← g, G, 그램, gram, grams
 *   kg ← kg, KG, 킬로그램, kilogram, kilograms
 *   ml ← ml, mL, ML, 밀리리터, 미리리터, ㎖
 *   L  ← L, l, 리터, liter, litre
 *   개 ← 개, 개수, ea, EA, pcs, piece, pieces
 *   장 ← 장, sheet, sheets
 *
 * Unknown values pass through unchanged so display-only contexts keep them.
 * Empty / null / whitespace → "". Used for COMPARISON only — does not
 * mutate stored sheet values.
 */
export function normalizeUnit(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  const lower = s.toLowerCase();
  if (s === "그램" || lower === "gram" || lower === "grams" || lower === "g") return "g";
  if (s === "킬로그램" || lower === "kilogram" || lower === "kilograms" || lower === "kg") return "kg";
  if (s === "밀리리터" || s === "미리리터" || s === "㎖" || lower === "ml" || lower === "mℓ") return "ml";
  if (s === "리터" || lower === "liter" || lower === "litre" || lower === "l") return "L";
  if (s === "개" || s === "개수" || lower === "ea" || lower === "pcs" || lower === "piece" || lower === "pieces") return "개";
  if (s === "장" || lower === "sheet" || lower === "sheets") return "장";
  return s;
}

/**
 * Convert a quantity between compatible units. Inputs are auto-normalized
 * via normalizeUnit so verbose / legacy labels (e.g. "그램", "kilogram") are
 * recognized. Returns
 *   { compatible: true, qty }  on success
 *   { compatible: false }      when the conversion is undefined.
 *
 * Identical units pass through. Mass: kg ↔ g (×/÷1000). Volume: L ↔ ml
 * (×/÷1000). Count (개 · 장) and any other combinations are NOT
 * auto-converted — those return `{ compatible: false }`.
 *
 * Used by both the client preview and server-side consumeFromExplicit so
 * stock comparison and writeback stay in the material's own unit.
 */
export interface QtyConversion {
  compatible: boolean;
  qty: number;
}

export function convertQty(qty: number, fromUnit: string, toUnit: string): QtyConversion {
  const a = normalizeUnit(fromUnit);
  const b = normalizeUnit(toUnit);
  if (!a || !b) return { compatible: true, qty }; // missing unit info — treat as same
  if (a === b) return { compatible: true, qty };
  // Mass
  if (a === "kg" && b === "g")  return { compatible: true, qty: qty * 1000 };
  if (a === "g"  && b === "kg") return { compatible: true, qty: qty / 1000 };
  // Volume
  if (a === "L"  && b === "ml") return { compatible: true, qty: qty * 1000 };
  if (a === "ml" && b === "L")  return { compatible: true, qty: qty / 1000 };
  return { compatible: false, qty: 0 };
}

/**
 * Pick the production-side usage unit for a material. Resolution order:
 *   1) material.costUnit (authoritative — populated by the normalized
 *      auto-cost on /materials and /material-transactions)
 *   2) fallback table: kg → g, L → ml, others passthrough
 *
 * Used by BOM editors and production-execution rows so kg/L purchases get
 * recorded as g/ml usage automatically. Pure helper — does not mutate.
 */
export function usageUnitFor(material: {
  costUnit?: string;
  unit?: string;
}): string {
  const cu = (material.costUnit ?? "").trim();
  if (cu) return cu;
  const u = (material.unit ?? "").trim();
  if (u === "kg") return "g";
  if (u === "L")  return "ml";
  return u;
}

export function normalizeUnitCost(args: {
  unitPrice: number;
  capacity: number;
  unit: string;
}): NormalizedCost {
  const purchaseUnit = (args.unit ?? "").trim();
  const cap = Number(args.capacity) || 0;
  let normalizedCapacity = cap;
  let costUnit = purchaseUnit;
  if (purchaseUnit === "kg") {
    normalizedCapacity = cap * 1000;
    costUnit = "g";
  } else if (purchaseUnit === "L") {
    normalizedCapacity = cap * 1000;
    costUnit = "ml";
  }
  const unitCost = normalizedCapacity > 0 && args.unitPrice > 0
    ? Math.round(args.unitPrice / normalizedCapacity)
    : 0;
  return { unitCost, costUnit, normalizedCapacity };
}

// ─── Unit consistency policy by category ──────────────────
// Liquids → ml, mass/solid → g, packaging/count → 개 or 장.
// Used to auto-suggest unit on /materials and to warn (NOT block) when a
// material's costUnit doesn't match the recommended unit on /bom pickers.
export const RECOMMENDED_UNIT_BY_CATEGORY: Partial<Record<MaterialCategory, string[]>> = {
  "향료": ["ml"],
  "오일": ["ml"],
  "안료": ["g"],
  "왁스": ["g"],
  "기본원료": ["g"],
  "케미컬": ["ml", "g"],
  "패키지": ["개", "장"],
  "용기": ["개"],
  "바인더": ["g"],
  "스티커": ["장"],
};

export function recommendedUnitForCategory(category: MaterialCategory): string {
  return RECOMMENDED_UNIT_BY_CATEGORY[category]?.[0] ?? "";
}

export function unitConsistencyWarning(
  category: MaterialCategory,
  costUnit: string | undefined,
): string {
  const accepted = RECOMMENDED_UNIT_BY_CATEGORY[category];
  if (!accepted || accepted.length === 0) return "";
  const cu = normalizeUnit(costUnit);
  if (!cu) return "";
  if (accepted.some((u) => normalizeUnit(u) === cu)) return "";
  if (category === "향료" || category === "오일") return "액체류 원료는 ml 단위 사용을 권장합니다.";
  if (category === "안료" || category === "왁스" || category === "기본원료" || category === "바인더") {
    return "분체/고체 원료는 g 단위 사용을 권장합니다.";
  }
  if (category === "패키지" || category === "용기" || category === "스티커") {
    return "포장/개수류 원료는 개 또는 장 단위 사용을 권장합니다.";
  }
  return `${category} 카테고리는 ${accepted.join(" 또는 ")} 단위 사용을 권장합니다.`;
}

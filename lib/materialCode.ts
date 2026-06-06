import type { MaterialCategory } from "@/types";

// ─── Category → prefix mapping (per spec) ─────────────────
// The keys cover every value of MaterialCategory. Legacy categories that
// existed before this code system (바인더, 용기, 스티커) map to "ETC" so
// they can still be encoded without breaking existing data.
export const CATEGORY_PREFIX: Record<MaterialCategory, string> = {
  기본원료: "B",
  왁스: "W",
  오일: "O",
  안료: "P",
  향료: "F",
  케미컬: "C",
  패키지: "PKG",
  기타: "ETC",
  // Legacy / non-spec categories — keep valid via ETC fallback.
  바인더: "ETC",
  용기: "ETC",
  스티커: "ETC",
};

// Categories shown in the picker, ordered as per spec.
export const SPEC_CATEGORIES: MaterialCategory[] = [
  "기본원료", "왁스", "오일", "안료", "향료", "케미컬", "패키지", "기타",
];

/**
 * Parse a code like "W-001" into { prefix:"W", seq:1 }.
 * Returns null for malformed input. Pad length is not enforced — "W-1"
 * and "W-001" both parse to seq=1.
 */
export function parseMaterialCode(code: string): { prefix: string; seq: number } | null {
  const m = String(code ?? "").trim().toUpperCase().match(/^([A-Z]+)-(\d{1,6})$/);
  if (!m) return null;
  const seq = Number(m[2]);
  if (!Number.isFinite(seq) || seq <= 0) return null;
  return { prefix: m[1], seq };
}

/**
 * Suggest the next available code for the given category.
 *
 *   prefix = CATEGORY_PREFIX[category] (defaults to ETC)
 *   next   = max(existing seq for this prefix) + 1, zero-padded to 3 digits
 *
 * Manual override is allowed at the call site — this only suggests.
 */
export function nextMaterialCode(
  category: MaterialCategory,
  existingCodes: string[],
): string {
  const prefix = CATEGORY_PREFIX[category] ?? "ETC";
  let max = 0;
  for (const c of existingCodes) {
    const parsed = parseMaterialCode(c);
    if (parsed && parsed.prefix === prefix) {
      if (parsed.seq > max) max = parsed.seq;
    }
  }
  const next = (max + 1).toString().padStart(3, "0");
  return `${prefix}-${next}`;
}

/** Trim + uppercase normalization used for uniqueness comparisons. */
export function normalizeMaterialCode(code: string | undefined | null): string {
  return String(code ?? "").trim().toUpperCase();
}

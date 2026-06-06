/**
 * Schema-layer hidden-field filter.
 *
 * Single source of truth for which sheet columns must be EXCLUDED from any
 * UI surface that generates columns/forms/detail-views dynamically from the
 * sheet schema. Applied at the schema source (services/csvSync.listTabs) and
 * at any standalone dynamic renderer (lib/sheetDefs consumers, /schema doc).
 *
 *   - This is UI-only. Google Sheets columns are NOT removed.
 *   - The base schema objects (SHEET_DEFS, TAB_DEFS) keep all columns so
 *     save/load logic, CSV sync, Apps Script initialization, etc. all
 *     continue to work over the full column set.
 *   - `scentName` / `향` / `향명` are intentionally NOT in any set — they
 *     remain visible.
 */

export const hiddenFieldsBySheet: Readonly<Record<string, ReadonlyArray<string>>> = {
  "원료재고": ["expiryDate", "유통기한"],
  "품목마스터": [
    "colorCode", "색상코드",
    "scentCode", "향코드",
    "productionUnit", "제조단위", "제조단위(참고)",
  ],
};

/** Backwards-compatible alias for older import sites. */
export const HIDDEN_UI_FIELDS_BY_SHEET = hiddenFieldsBySheet;

/** Flattened set used by renderers that don't have a sheet context. */
export const HIDDEN_FIELDS_FLAT: ReadonlySet<string> = new Set(
  Object.values(hiddenFieldsBySheet).flat(),
);

/**
 * Filter a list of column names against the hidden set for one sheet.
 * Returns a new array (input is not mutated). Matching is case-insensitive
 * so headers with quirky casing still get filtered defensively.
 */
export function filterHiddenColumns(
  sheetName: string,
  columns: ReadonlyArray<string>,
): string[] {
  const hidden = hiddenFieldsBySheet[sheetName];
  if (!hidden || hidden.length === 0) return [...columns];
  const lowered = new Set(hidden.map((h) => h.toLowerCase()));
  return columns.filter((c) => !lowered.has(String(c).toLowerCase()));
}

/**
 * Convenience: get the UI-visible columns for a sheet given the canonical
 * column list. Schema consumers should call this instead of touching the
 * raw `headers` array.
 */
export function visibleColumnsForSheet(
  sheetName: string,
  allColumns: ReadonlyArray<string>,
): string[] {
  return filterHiddenColumns(sheetName, allColumns);
}

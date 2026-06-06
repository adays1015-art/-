/**
 * Worker master organized by team.
 *
 * Keep this hardcoded list small and curated — it backs the per-process
 * 작업자 dropdowns in 품목생산 and the 폐기 처리 모달. Order matters: the
 * first entry in each array is used as the auto-default for that team.
 *
 * Extension path:
 *   - Add a new team key (e.g. `qc` becomes populated, or new `packing`).
 *   - Add names to the relevant array.
 *   - Selectors that consume `production` continue to work unchanged.
 *
 * Future: this can move to a 작업자마스터 sheet if the list grows; the
 * selector helpers below already abstract the source.
 */

export type TeamKey = "production" | "fragrance" | "shipping" | "logistics" | "packing" | "qc";

export const WORKERS_BY_TEAM: Record<TeamKey, string[]> = {
  production: ["정선희", "안정현", "김연수"],
  fragrance:  ["이정혜", "김지은"],
  shipping:   [],
  logistics:  [],
  packing:    [],
  qc:         [],
};

/** Production workers — used by 배합/분산/사출 dropdowns and the LOT-level
 *  assignee selector. */
export function getProductionWorkers(): string[] {
  return WORKERS_BY_TEAM.production.slice();
}

/** Fragrance workers — used by /fragrance-production worker / 배합 / 시향
 *  / 폐기 dropdowns. Distinct from production team. */
export function getFragranceWorkers(): string[] {
  return WORKERS_BY_TEAM.fragrance.slice();
}

/** QC workers — falls back to production team until the QC team list is
 *  populated separately. */
export function getQcWorkers(): string[] {
  return WORKERS_BY_TEAM.qc.length > 0
    ? WORKERS_BY_TEAM.qc.slice()
    : WORKERS_BY_TEAM.production.slice();
}

/** First name from the chosen list — used as auto-default for new fields. */
export function defaultWorker(team: TeamKey = "production"): string {
  const list = team === "qc" ? getQcWorkers() : (WORKERS_BY_TEAM[team] ?? []);
  return list[0] ?? "";
}

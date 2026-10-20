import type {
  Dataset, ErpCut, Inference, Point, Recommendation, Remnant, ScrapReason,
} from "./types";
import { circle, netArea, steelWeightKg } from "./geometry";

// 샘플 데이터 생성기 — DB 연결 전 대시보드 확인용.
// 16주 시뮬레이션: 앞 4주는 V1.0 기준선, 5주차부터 V2.0 도입 후 6주에 걸쳐 목표 수준으로 개선.
// 같은 시드면 항상 같은 데이터가 나온다.

const TENANT = "daelim";
const SITE = "busan-main";
const WEEKS = 16;
const BASELINE_WEEKS = 4;
const WARMUP_WEEKS = 10; // 기준선 이전부터 운영 중이던 상태를 만들기 위한 선행 기간 (KPI 추이에는 미포함)
const RAMP_WEEKS = 6;
const DAY = 86_400_000;

export const SEED_NOW = new Date("2026-10-19T09:00:00+09:00");

const MATERIALS = ["SS275", "SS275", "SS275", "SM355", "SM355", "SS400"];
const THICKNESSES = [6, 9, 12, 12, 16, 20, 25];
const RACKS = ["A", "B", "C", "D"];

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateDataset(seed = 20261019): Dataset {
  const rnd = mulberry32(seed);
  const between = (a: number, b: number) => a + (b - a) * rnd();
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const jitter = (v: number, spread: number) => v + (rnd() - 0.5) * 2 * spread;
  const round10 = (v: number) => Math.round(v / 10) * 10;

  const end = SEED_NOW.getTime();
  const baselineStart = end - WEEKS * 7 * DAY;
  const start = baselineStart - WARMUP_WEEKS * 7 * DAY;
  const pilotStart = baselineStart + BASELINE_WEEKS * 7 * DAY;
  // 0 = V1.0, 1 = V2.0 목표 수준
  const progress = (t: number) =>
    t < pilotStart ? 0 : Math.min(1, (t - pilotStart) / (RAMP_WEEKS * 7 * DAY) + 0.15);
  const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

  // 절단 후 남는 전형적인 형상: 직사각형에서 모서리·L자·사선을 잘라낸 형태 + 가끔 홀
  function makeShape(): { outline: Point[]; holes: Point[][] } {
    const w = round10(between(300, 2400));
    const h = round10(between(200, Math.min(1500, w)));
    const kind = rnd();
    let outline: Point[];
    if (kind < 0.25) {
      outline = [[0, 0], [w, 0], [w, h], [0, h]];
    } else if (kind < 0.6) {
      const cx = round10(w * between(0.3, 0.7)), cy = round10(h * between(0.3, 0.7));
      outline = [[0, 0], [w, 0], [w, cy], [cx, cy], [cx, h], [0, h]];
    } else if (kind < 0.85) {
      const c = round10(Math.min(w, h) * between(0.2, 0.5));
      outline = [[0, 0], [w - c, 0], [w, c], [w, h], [0, h]];
    } else {
      const nx = round10(w * between(0.3, 0.5)), nw = round10(w * 0.2), nd = round10(h * between(0.2, 0.4));
      outline = [[0, 0], [nx, 0], [nx, nd], [nx + nw, nd], [nx + nw, 0], [w, 0], [w, h], [0, h]];
    }
    const holes: Point[][] = [];
    if (rnd() < 0.2 && w > 600 && h > 400) {
      holes.push(circle(round10(w * 0.2), round10(h * 0.75), round10(between(30, 60))));
    }
    return { outline, holes };
  }

  const remnants: Remnant[] = [];
  const inferences: Inference[] = [];
  const erpCuts: ErpCut[] = [];
  const recommendations: Recommendation[] = [];
  let seq = 0;
  const id = (p: string) => `${p}-${String(++seq).padStart(5, "0")}`;

  for (let t = start; t < end; t += DAY) {
    const weekday = new Date(t).getDay();
    if (weekday === 0) continue; // 일요일 휴무
    const p = progress(t);
    const cuts = Math.round(between(6, 11) * (weekday === 6 ? 0.4 : 1));

    for (let i = 0; i < cuts; i++) {
      const at = t + between(8, 18) * 3_600_000;
      const produced = rnd() < 0.85;
      const cut: ErpCut = { id: id("cut"), siteId: SITE, at: new Date(at).toISOString(), producedRemnant: produced, remnantId: null };
      erpCuts.push(cut);
      if (!produced) continue;

      // 등록 누락률: V1.0 18% → V2.0 4%
      if (rnd() < lerp(0.18, 0.04, p)) continue;

      const { outline, holes } = makeShape();
      const material = pick(MATERIALS);
      const thicknessMm = pick(THICKNESSES);
      const areaMm2 = Math.round(netArea(outline, holes));
      const usesAi = at >= pilotStart;
      const autoAccepted = usesAi && rnd() < lerp(0.55, 0.86, p);
      const createdAt = at + between(5, 40) * 60_000;

      // 재사용 확률: V1.0 30% → V2.0 62%
      const reused = rnd() < lerp(0.3, 0.62, p);
      // 사용·폐기 모두 발생 후 수 주 안에 정리되도록 맞춘다 (폐기만 늦으면 주간 재사용률이 왜곡됨)
      // 일부는 적치대 구석에 잊혀 장기 보관 잔재가 된다
      const forgotten = !reused && rnd() < 0.12;
      const closeAt = createdAt + (reused ? between(2, 45) : forgotten ? between(70, 140) : between(10, 55)) * DAY;
      const closed = closeAt < end;
      let scrapReason: ScrapReason | null = null;
      if (closed && !reused) scrapReason = rnd() < 0.06 ? "unusable" : rnd() < 0.6 ? "not_found" : "aged";

      const r: Remnant = {
        id: id("rm"),
        tenantId: TENANT,
        siteId: SITE,
        engravedId: `DL${new Date(createdAt).toISOString().slice(2, 10).replace(/-/g, "")}-${String(seq).padStart(4, "0")}`,
        material,
        thicknessMm,
        outline,
        holes,
        areaMm2,
        weightKg: Math.round(steelWeightKg(areaMm2, thicknessMm) * 10) / 10,
        status: !closed ? "available" : reused ? "used" : "scrapped",
        parentId: null,
        rack: `${pick(RACKS)}-${String(1 + Math.floor(rnd() * 12)).padStart(2, "0")}`,
        source: !usesAi ? "manual" : autoAccepted ? "ai" : "ai_corrected",
        createdAt: new Date(createdAt).toISOString(),
        closedAt: closed ? new Date(closeAt).toISOString() : null,
        scrapReason,
      };
      // 사용된 잔재의 일부는 다시 잔재(재잔재)를 남긴다 — 계보 예시
      const parent = remnants.length > 20 && rnd() < 0.12
        ? remnants[remnants.length - 1 - Math.floor(rnd() * 20)]
        : null;
      if (parent && parent.status === "used" && parent.material === material) r.parentId = parent.id;

      remnants.push(r);
      cut.remnantId = r.id;

      if (usesAi) {
        inferences.push({
          id: id("inf"),
          remnantId: r.id,
          modelVersion: p < 0.6 ? "maskrcnn-v0.3" : "maskrcnn-v0.5",
          confidence: Math.round(Math.min(0.99, jitter(lerp(0.86, 0.95, p), 0.04)) * 1000) / 1000,
          latencyMs: Math.round(jitter(lerp(2600, 1400, p), 400)),
          corrected: !autoAccepted,
          createdAt: new Date(createdAt - 60_000).toISOString(),
        });
      }
    }

    // 잔재 매칭: V1.0은 작업자 수동 검색(기준선 측정 기록), V2.0은 Top-3 추천
    const requests = Math.round(between(4, 8) * (weekday === 6 ? 0.4 : 1));
    for (let i = 0; i < requests; i++) {
      const at = t + between(8, 18) * 3_600_000;
      const ai = at >= pilotStart;
      const pool = remnants.filter((x) => Date.parse(x.createdAt) < at).slice(-60);
      const cand = ai ? [pick(pool), pick(pool), pick(pool)].filter(Boolean).map((x) => x.id) : [];
      const seconds = ai ? Math.max(15, jitter(lerp(150, 45, p), 25)) : Math.max(240, jitter(720, 260));
      const roll = rnd();
      const acceptRate = lerp(0.62, 0.86, p);
      const action = !ai ? "accepted" : roll < acceptRate ? "accepted" : roll < acceptRate + 0.09 ? "modified" : "rejected";
      const decided = at + seconds * 1000 < end;
      recommendations.push({
        id: id("rec"),
        siteId: SITE,
        mode: ai ? "ai" : "manual",
        partNo: `P-${2600 + Math.floor(rnd() * 400)}`,
        material: pick(MATERIALS),
        thicknessMm: pick(THICKNESSES),
        requestedAt: new Date(at).toISOString(),
        candidateIds: cand,
        decidedAt: decided ? new Date(at + seconds * 1000).toISOString() : null,
        action: decided ? action : null,
        chosenRank: decided && ai && action === "accepted" ? 1 + Math.floor(rnd() * rnd() * 3) : null,
      });
    }
  }

  return {
    generatedAt: SEED_NOW.toISOString(),
    baselineStart: new Date(baselineStart).toISOString(),
    pilotStart: new Date(pilotStart).toISOString(),
    remnants,
    inferences,
    erpCuts,
    recommendations,
  };
}

// 데이터 모델 — 기획서 4.5절 핵심 테이블과 1:1 대응 (db/schema.sql 참조).
// 모든 레코드에 tenantId·siteId를 둬서 V3.0 멀티테넌트 확장 시 구조 변경이 없도록 한다.

export type Point = [number, number]; // mm 단위 작업대 평면 좌표

export type RemnantStatus = "available" | "reserved" | "used" | "scrapped";

// 잔재가 어떻게 등록됐는지 — 자동화율 KPI의 근거
export type RegisterSource = "manual" | "ai" | "ai_corrected";

export type ScrapReason =
  | "unusable"   // 너무 작거나 형상상 재사용 불가 (손실 아님)
  | "not_found"  // 등록 누락·위치 불명으로 못 찾아 폐기 (손실)
  | "aged";      // 장기 방치 후 일괄 폐기 (손실)

export interface Remnant {
  id: string;
  tenantId: string;
  siteId: string;
  engravedId: string;        // 휴대용 각인기(V1.0) 고유 ID
  material: string;          // SS275, SM355 …
  thicknessMm: number;
  outline: Point[];          // 외곽선 (시계 방향, 닫힘점 생략)
  holes: Point[][];
  areaMm2: number;
  weightKg: number;
  status: RemnantStatus;
  parentId: string | null;   // 잔재 계보: 원판 → 잔재 → 재잔재
  rack: string;              // 적치 위치
  source: RegisterSource;
  createdAt: string;         // ISO
  closedAt: string | null;   // used/scrapped 확정 시각
  scrapReason: ScrapReason | null;
}

export interface Inference {
  id: string;
  remnantId: string;
  modelVersion: string;
  confidence: number;
  latencyMs: number;
  corrected: boolean;        // 작업자가 외곽선을 수정했는지
  createdAt: string;
}

// ERP 절단 실적 — "잔재가 발생했어야 하는" 건수. 누락률 KPI의 분모.
export interface ErpCut {
  id: string;
  siteId: string;
  at: string;
  producedRemnant: boolean;
  remnantId: string | null;  // 실제 등록된 잔재와 대조된 경우
}

export type DecisionAction = "accepted" | "modified" | "rejected";

// manual = V1.0 방식(작업자가 DB를 직접 검색, 기준선 측정용 기록), ai = V2.0 추천 엔진
export type MatchMode = "manual" | "ai";

export interface Recommendation {
  id: string;
  siteId: string;
  mode: MatchMode;
  partNo: string;
  material: string;
  thicknessMm: number;
  requestedAt: string;
  candidateIds: string[];    // Top-3
  decidedAt: string | null;
  action: DecisionAction | null;
  chosenRank: number | null; // 1~3, rejected면 null
}

export interface Dataset {
  generatedAt: string;
  baselineStart: string;     // V1.0 기준선 측정 시작 (KPI 추이 시작점)
  pilotStart: string;        // V2.0 도입 시점 (그 전은 V1.0 기준선)
  remnants: Remnant[];
  inferences: Inference[];
  erpCuts: ErpCut[];
  recommendations: Recommendation[];
}

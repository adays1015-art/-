-- 비정형 철판 잔재 통합관리 시스템 V2.0 — PostgreSQL + PostGIS 스키마 (기획서 4.5절)
-- lib/types.ts 와 1:1 대응. 모든 테이블에 tenant_id·site_id (V3.0 멀티테넌트 대비).
-- 좌표계: 작업대 평면 mm 좌표 (SRID 0, 지리 좌표 아님)

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TYPE remnant_status AS ENUM ('available', 'reserved', 'used', 'scrapped');
CREATE TYPE register_source AS ENUM ('manual', 'ai', 'ai_corrected');
CREATE TYPE scrap_reason AS ENUM ('unusable', 'not_found', 'aged');
CREATE TYPE match_mode AS ENUM ('manual', 'ai');
CREATE TYPE decision_action AS ENUM ('accepted', 'modified', 'rejected');

CREATE TABLE sites (
  id          text PRIMARY KEY,
  tenant_id   text NOT NULL,
  name        text NOT NULL
);

CREATE TABLE remnants (
  id            text PRIMARY KEY,
  tenant_id     text NOT NULL,
  site_id       text NOT NULL REFERENCES sites(id),
  engraved_id   text NOT NULL,
  material      text NOT NULL,
  thickness_mm  numeric(6,2) NOT NULL,
  shape         geometry(Polygon, 0) NOT NULL,   -- 외곽선 + 홀(내부 링)
  area_mm2      numeric(14,1) NOT NULL,
  weight_kg     numeric(10,1) NOT NULL,
  status        remnant_status NOT NULL DEFAULT 'available',
  parent_id     text REFERENCES remnants(id),    -- 잔재 계보
  rack          text,
  source        register_source NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  closed_at     timestamptz,
  scrap_reason  scrap_reason,
  UNIQUE (tenant_id, engraved_id)
);
CREATE INDEX remnants_lookup ON remnants (tenant_id, status, material, thickness_mm);
CREATE INDEX remnants_shape ON remnants USING gist (shape);

-- 촬영 원본 (이미지는 오브젝트 스토리지, 여기엔 경로만)
CREATE TABLE captures (
  id              text PRIMARY KEY,
  tenant_id       text NOT NULL,
  site_id         text NOT NULL REFERENCES sites(id),
  image_key       text NOT NULL,
  camera_id       text NOT NULL,
  calibration_ver text NOT NULL,
  captured_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE inferences (
  id              text PRIMARY KEY,
  tenant_id       text NOT NULL,
  capture_id      text REFERENCES captures(id),
  remnant_id      text REFERENCES remnants(id),
  model_version   text NOT NULL,
  predicted_shape geometry(Polygon, 0) NOT NULL,
  confidence      numeric(5,4) NOT NULL,
  latency_ms      integer NOT NULL,
  corrected       boolean NOT NULL DEFAULT false,
  corrected_shape geometry(Polygon, 0),          -- 수정본 = 재학습 데이터
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ERP 절단 실적 (누락률 KPI 분모)
CREATE TABLE erp_cuts (
  id               text PRIMARY KEY,
  tenant_id        text NOT NULL,
  site_id          text NOT NULL REFERENCES sites(id),
  at               timestamptz NOT NULL,
  produced_remnant boolean NOT NULL,
  remnant_id       text REFERENCES remnants(id)
);

CREATE TABLE recommendations (
  id             text PRIMARY KEY,
  tenant_id      text NOT NULL,
  site_id        text NOT NULL REFERENCES sites(id),
  mode           match_mode NOT NULL,
  part_no        text NOT NULL,
  part_shape     geometry(Polygon, 0),           -- 부재 DXF에서 변환
  material       text NOT NULL,
  thickness_mm   numeric(6,2) NOT NULL,
  requested_at   timestamptz NOT NULL DEFAULT now(),
  candidate_ids  text[] NOT NULL DEFAULT '{}',   -- Top-3 (점수·근거는 V2에서 별도 테이블)
  decided_at     timestamptz,
  action         decision_action,
  chosen_rank    smallint CHECK (chosen_rank BETWEEN 1 AND 3),
  decided_by     text
);
CREATE INDEX recommendations_time ON recommendations (tenant_id, decided_at);

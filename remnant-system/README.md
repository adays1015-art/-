# 잔재관리 시스템 (remnant-system)

「딥러닝 기반 비정형 철판 잔재 통합관리 시스템 V2.0」 관리자 대시보드 (Next.js).
생산관리 시스템과 분리된 별도 프로젝트입니다. 기획서의 1단계(데이터 구조 + 관리자 대시보드) 구현.

## 화면
- **대시보드** (`/`): 실증 KPI 6종(매칭 시간·입력 누락률·등록 자동화율·재사용률·매입손실률·Top-3 채택률)의
  최근 4주 값, V1.0 기준 → 목표, 주간 추이(V2.0 도입 시점 표시) / 재질·두께별 가용 재고 / 장기 보관 잔재
- **잔재 목록** (`/remnants`): 상태·재질·두께·각인 ID 필터, 형상 썸네일
- **잔재 상세** (`/remnants/[id]`): 외곽선·치수, AI 인식 결과, 잔재 계보(상위·하위)

## API
- `GET /api/kpi?days=28` — 현재 KPI + 주간 추이
- `GET /api/remnants?status=available&material=SS275&thickness=12`

## 구조
| 경로 | 내용 |
|---|---|
| `lib/types.ts` | 데이터 모델 (기획서 4.5절) |
| `lib/kpi.ts` | KPI 산출식 (기획서 2.2절) — 원본 기록에서 직접 계산 |
| `lib/store.ts` | 데이터 접근 계층 — DB 연결 시 이 파일만 교체 |
| `lib/seed.ts` | 샘플 데이터 생성기 (16주, 앞 4주 V1.0 기준선) |
| `db/schema.sql` | PostgreSQL + PostGIS 스키마 |

## 로컬 실행
```bash
npm install
npm run dev   # http://localhost:3000
```

## 배포 (Vercel)
- Framework: Next.js (`vercel.json`에 고정)
- Root Directory: `remnant-system`
- 현재 인메모리(샘플 데이터) 모드 — PostgreSQL 연결은 다음 단계

# 잔재관리 시스템 (remnant-system)

「딥러닝 기반 비정형 철판 잔재 통합관리 시스템 V2.0」 관리자 대시보드·작업자 등록 앱 (Next.js).
생산관리 시스템과 분리된 별도 프로젝트입니다.

| 단계 | 내용 | 상태 |
|---|---|---|
| 1 | 데이터 구조 + 관리자 대시보드 | 완료 |
| 2 | 작업자 등록 화면 (사진 → 외곽선 → 치수·정보) | 완료 |
| 3 | 추천 엔진 v1 (부재 DXF → Top-3) | 예정 |
| 4 | 비전 인식 연결 (사진 → 자동 외곽선) | 예정 |

## 화면
- **대시보드** (`/`): 실증 KPI 6종(매칭 시간·입력 누락률·등록 자동화율·재사용률·매입손실률·Top-3 채택률)의
  최근 4주 값, V1.0 기준 → 목표, 주간 추이(V2.0 도입 시점 표시) / 재질·두께별 가용 재고 / 장기 보관 잔재
- **잔재 목록** (`/remnants`): 상태·재질·두께·각인 ID 필터, 형상 썸네일
- **잔재 상세** (`/remnants/[id]`): 외곽선·치수, 등록 사진, AI 인식 결과, 잔재 계보(상위·하위)
- **잔재 등록** (`/register`): 사진 촬영 → 사진 위에 외곽선 찍기(첫 점을 다시 탭하면 닫힘, 닫은 뒤 변 근처 탭으로 점 추가,
  드래그로 이동) → 외접 가로·세로(mm) 입력으로 mm 좌표 변환 → 각인 ID·재질·두께·적치 위치 → 저장 즉시 대시보드 반영

## API
- `GET /api/kpi?days=28` — 현재 KPI + 주간 추이
- `GET /api/remnants?status=available&material=SS275&thickness=12`
- `POST /api/remnants` — 잔재 등록 `{ engravedId, material, thicknessMm, outline: [[x,y],…](mm), rack, photo? }`

## 구조
| 경로 | 내용 |
|---|---|
| `lib/types.ts` | 데이터 모델 (기획서 4.5절) |
| `lib/kpi.ts` | KPI 산출식 (기획서 2.2절) — 원본 기록에서 직접 계산 |
| `lib/store.ts` | 데이터 접근 계층 — DB 연결 시 이 파일만 교체 |
| `lib/seed.ts` | 샘플 데이터 생성기 (16주, 앞 4주 V1.0 기준선, 현재 시각까지) |
| `lib/time.ts` | 한국 시간(KST) 기준 날짜·주간 계산 — 서버가 UTC여도 동일 |
| `components/OutlineEditor.tsx` | 외곽선 편집기 (4단계에서 AI 결과가 초기값으로 들어옴) |
| `db/schema.sql` | PostgreSQL + PostGIS 스키마 |

## 로컬 실행
```bash
npm install
npm run dev   # http://localhost:3000
```

## 배포 (Vercel)
- Framework: Next.js (`vercel.json`에 고정)
- Root Directory: `remnant-system`
- 현재 인메모리(샘플 데이터) 모드 — 등록한 잔재는 서버 재시작 시 사라짐. PostgreSQL 연결 시 영구 저장

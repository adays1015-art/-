# 주간 작업보고 · 관리 시스템 (B.fter Another Day)

생산관리와 **완전히 분리된 별도 시스템**입니다. 각 팀 인원이 한 주 동안 한 일을
보고(제출)하고, 관리자가 한 화면에서 제출 현황·확인 필요·이슈를 집계해 확인합니다.

## 화면

- **로그인** — 공용 비밀번호 + 역할(관리자/팀원) + 이름·팀 선택
- **달력 대시보드(`/`, 관리자 메인)** — 월간 달력에 일정 표시 + `급한 일정`·`확인 필요 일정` 패널.
  일정 항목: 날짜/기간 · 제목 · 담당자 · 분류(회의/납품/출장/점검/마감) · 급함 표시 · 확인 토글
- **제출현황(`/status`, 관리자)** — 주차별 팀 제출 현황·미제출자·확인 필요·이슈
- **주간보고(`/reports`)** — 팀원은 본인 보고 작성·제출 / 관리자는 전체 열람·확인

## 데이터 저장

- 기본: **Google Sheets** (`WR_APPS_SCRIPT_URL` 설정 시) — 탭 `일정`, `주간보고`, `팀원`
- 미설정 시: 로컬 JSON 파일 (`data/`) — 개발/미리보기 전용

> ⚠️ Vercel 등 서버리스 배포에서는 파일 저장이 보존되지 않습니다.
> **배포 시 반드시 Google Sheets(WR_APPS_SCRIPT_URL)를 설정**하세요.

## 로컬 실행

```bash
cd weekly-report
npm install
cp .env.example .env.local   # 필요 시 값 수정
npm run dev
# http://localhost:3100
```

기본 비밀번호: `bfter1234` (`.env.local` 의 `WR_PASSWORD` 로 변경)

## Google Sheets 연동 (배포 전 1회)

1. 보고를 저장할 Google 스프레드시트 생성
2. [확장 프로그램] → [Apps Script] → `Code.gs` 에 `apps-script.gs` 내용 붙여넣기
3. **배포 → 새 배포 → 웹 앱** (실행: 본인 / 액세스: 모든 사용자)
4. 배포 URL(`.../exec`)을 환경변수 `WR_APPS_SCRIPT_URL` 에 설정
5. (선택) `팀원` 탭에 `team`, `name` 으로 명단을 넣으면 **미제출자**가 집계됩니다.

## 배포 (Vercel)

1. 이 저장소를 Vercel 에 임포트
2. **Root Directory** 를 `weekly-report` 로 지정
3. 환경변수 설정: `WR_PASSWORD`, `WR_SECRET`, `WR_APPS_SCRIPT_URL`
4. 프로젝트 이름/도메인을 **`bfteranotherday`** 로 지정
   → `https://bfteranotherday.vercel.app`

## 폴더 구조

```
weekly-report/
  app/
    layout.tsx              상단 헤더 + 네비
    login/                  로그인 화면
    page.tsx                관리자 대시보드
    DashboardClient.tsx
    reports/page.tsx        주간보고
    ReportsClient.tsx
    api/auth/(login|logout) 인증
    api/reports/route.ts    보고 CRUD/확인
  components/AppNav.tsx
  lib/
    types.ts  week.ts  auth.ts  sheets.ts  store.ts
  apps-script.gs            Google Sheets 핸들러(배포용)
  .env.example
```

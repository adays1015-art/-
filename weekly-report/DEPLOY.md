# 배포 가이드 (Vercel + Google Sheets)

목표: `https://bfteranotherday.vercel.app` 로 접속되는 주간 작업보고 시스템.

소요 시간: 약 15분. **순서대로** 따라 하세요.

---

## STEP 1 — Google Sheets 백엔드 만들기 (사장님 Google 계정)

1. Google Drive에서 새 **스프레드시트** 생성 → 이름 예: `주간보고-데이터`
2. 상단 메뉴 **확장 프로그램 → Apps Script** 클릭
3. 기본 `Code.gs` 내용을 모두 지우고, 이 저장소의
   **`weekly-report/apps-script.gs`** 내용을 전부 붙여넣기 → 💾 저장
4. 우측 상단 **배포 → 새 배포** 클릭
   - 톱니바퀴(유형 선택) → **웹 앱**
   - 설명: 아무거나
   - **실행 계정: 나**
   - **액세스 권한: 모든 사용자**  ← 중요 (앱 서버가 호출해야 함)
   - **배포** 클릭 → 권한 승인 팝업이 뜨면 본인 계정으로 **허용**
5. 표시되는 **웹 앱 URL** (`https://script.google.com/macros/s/AKfyc.../exec`) **복사**
   → 이게 `WR_APPS_SCRIPT_URL` 값입니다.

> 시트 탭(`일정`, `주간보고`, `팀원`)은 첫 저장 때 자동 생성됩니다.
> `팀원` 탭에 `team`, `name` 열로 명단을 넣으면 '미제출자'가 집계됩니다.

---

## STEP 2 — Vercel에 올리기 (사장님 Vercel 계정)

1. https://vercel.com 로그인 → **Add New… → Project**
2. GitHub 저장소 **`adays1015-art/-`** 를 **Import**
   - (처음이면 GitHub 연동 → 이 저장소 접근 허용)
3. **Configure Project** 화면에서:
   - **Root Directory** → **`weekly-report`** 로 지정 (Edit 눌러 폴더 선택) ← 가장 중요
   - Framework Preset: `Next.js` (자동 감지됨)
4. **Environment Variables** 에 3개 추가:

   | Name | Value |
   |------|-------|
   | `WR_PASSWORD` | 팀 공용 로그인 비밀번호 (원하는 값) |
   | `WR_SECRET` | 아무 긴 무작위 문자열 (쿠키 서명용) |
   | `WR_APPS_SCRIPT_URL` | STEP 1에서 복사한 `...exec` URL |

5. **Deploy** 클릭 → 1~2분 후 완료

---

## STEP 3 — 도메인 이름 `bfteranotherday`

- 배포 후 **Project Settings → General → Project Name** 을 `bfteranotherday` 로 변경
  → 주소가 `https://bfteranotherday.vercel.app` 가 됩니다.
- (선택) 회사 도메인이 있으면 Settings → Domains 에서 연결.

---

## STEP 4 — 동작 확인

1. `https://bfteranotherday.vercel.app` 접속 → 로그인 화면
2. **관리자**로 로그인(비밀번호 = `WR_PASSWORD`) → 달력 대시보드
3. **일정 등록** 한 번 해보고, Google 스프레드시트 `일정` 탭에 행이 생기는지 확인
4. 팀원에게는 주소 + 공용 비밀번호만 공유 → 각자 **팀원**으로 로그인해 주간보고 작성

---

## 배포 브랜치

- 현재 작업 브랜치: `claude/gallant-heisenberg-6of81z`
- Vercel은 기본적으로 저장소의 기본 브랜치를 **Production** 으로 배포합니다.
  이 브랜치를 운영에 쓰려면 Vercel **Settings → Git → Production Branch** 에서
  해당 브랜치를 지정하거나, 기본 브랜치로 머지하세요.

## 문제 해결

- 저장 시 "Google Sheets가 필요합니다" 에러 → `WR_APPS_SCRIPT_URL` 미설정/오타.
- Apps Script 401/403 → 웹 앱 액세스가 "모든 사용자"인지 확인 후 **재배포**.
- 로그인 후 빈 화면 → 환경변수 저장 후 **Redeploy** 했는지 확인.

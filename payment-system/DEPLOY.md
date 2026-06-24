# 결제관리 시스템 — Vercel 배포 가이드

이 앱은 저장소(`adays1015-art/-`)의 **`payment-system/` 하위 폴더**에 있고,
코드는 **`claude/gallant-mendel-8yk769`** 브랜치에 있습니다. 생산관리 앱과 별개입니다.

## 처음 배포 (한 번만)

1. https://vercel.com 로그인 → **Add New… → Project**
2. **Import Git Repository** → `adays1015-art/-` 선택
   - 안 보이면 GitHub 연결 후 이 저장소 접근 권한 부여
3. 설정 화면에서:
   - **Root Directory**: `Edit` 클릭 → **`payment-system`** 선택  ← ★ 필수
   - Framework Preset: `Next.js` (자동 감지)
   - Build/Output: 기본값 그대로
   - Environment Variables: **없음** (메모리 모드라 설정 불필요)
4. **Deploy** 클릭

> 첫 빌드가 "payment-system 폴더 없음"으로 실패하면, 배포 대상 브랜치가
> 우리 브랜치가 아니기 때문입니다. 아래 5번으로 프로덕션 브랜치를 바꾸세요.

5. **프로덕션 브랜치 지정** (저장소 기본 브랜치가 달라서 필요)
   - 프로젝트 → **Settings → Git → Production Branch**
   - **`claude/gallant-mendel-8yk769`** 입력 후 저장
   - **Deployments** 탭 → 최신 배포 옆 **⋯ → Redeploy**

배포가 끝나면 `https://<프로젝트명>.vercel.app` 주소가 생깁니다.

## 이후 수정 → 자동 재배포

`claude/gallant-mendel-8yk769` 브랜치에 push 될 때마다 Vercel이 자동으로 다시 빌드·배포합니다.
(즉, 앞으로 제가 코드를 고쳐 push 하면 몇 분 뒤 같은 주소에 반영됩니다.)

## 참고
- 현재는 **인메모리(샘플 데이터) 모드** — 서버 재시작/재배포 시 입력 데이터가 초기화됩니다.
  영구 저장이 필요하면 Google Sheets 연동을 붙입니다(동일 service 인터페이스 뒤에 어댑터 추가).
- 로컬 실행: `cd payment-system && npm install && npm run dev` → http://localhost:3000

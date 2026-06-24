# 결제관리 시스템 (payment-system)

거래처별 **청구 → 수금 → 미수금**을 관리하는 독립 웹앱 (Next.js).
생산관리 시스템과 분리된 별도 프로젝트입니다.

## 화면
- **대시보드**: 총 청구/수금/미수금, 연체 건수, 미수 상위 거래처, 최근 수금
- **청구·수금**: 상태(미수/부분수금/연체/수금완료) 필터, 청구 등록, 건별 수금 기록, 미수 잔액 자동 계산
- **거래처**: 추가/수정/삭제, 거래처별 미수금 집계

## 로컬 실행
```bash
npm install
npm run dev   # http://localhost:3000
```

## 배포 (Vercel)
- Framework: Next.js (`vercel.json`에 고정)
- Root Directory: `payment-system`
- 현재 인메모리(샘플 데이터) 모드 — 영구저장은 Google Sheets 연동 예정

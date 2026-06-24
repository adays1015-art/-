/**
 * 인메모리 저장소 (MVP).
 *
 * 구글 시트 연동 전 단계 — 서버 프로세스가 사는 동안만 데이터가 유지된다.
 * (개발 서버 재시작 시 샘플 데이터로 초기화) 화면 확정 후 동일한 service
 * 인터페이스 뒤에 Google Sheets 어댑터를 끼우면 된다.
 */
import type { PayClient, Charge } from "@/types";

type Store = {
  clients: PayClient[];
  charges: Charge[];
};

declare global {
  // eslint-disable-next-line no-var
  var __PAYMENT_STORE__: Store | undefined;
}

function seed(): Store {
  return {
    clients: [
      { id: "CL-1", name: "(주)무지개상사", contact: "김구매", phone: "02-555-1234", note: "강남 본사", createdAt: "2026-05-01T00:00:00.000Z" },
      { id: "CL-2", name: "아트마켓", contact: "이담당", phone: "031-700-2200", note: "", createdAt: "2026-05-10T00:00:00.000Z" },
      { id: "CL-3", name: "한빛문구", contact: "박사장", phone: "051-330-7788", note: "부산", createdAt: "2026-05-20T00:00:00.000Z" },
    ],
    charges: [
      {
        id: "CH-1", clientName: "(주)무지개상사", chargeDate: "2026-05-25", title: "오일파스텔 24색 100개",
        amount: 1320000, dueDate: "2026-06-25", note: "",
        payments: [], createdAt: "2026-05-25T00:00:00.000Z",
      },
      {
        id: "CH-2", clientName: "아트마켓", chargeDate: "2026-05-15", title: "수채물감 12색 200개",
        amount: 1760000, dueDate: "2026-06-15", note: "분할 입금 예정",
        payments: [
          { id: "PM-1", date: "2026-06-01", amount: 800000, method: "계좌이체", memo: "1차" },
        ], createdAt: "2026-05-15T00:00:00.000Z",
      },
      {
        id: "CH-3", clientName: "한빛문구", chargeDate: "2026-04-30", title: "고체물감 팔레트 50개",
        amount: 825000, dueDate: "2026-05-31", note: "",
        payments: [], createdAt: "2026-04-30T00:00:00.000Z",
      },
      {
        id: "CH-4", clientName: "아트마켓", chargeDate: "2026-04-20", title: "오일파스텔 12색 80개",
        amount: 528000, dueDate: "2026-05-20", note: "",
        payments: [
          { id: "PM-2", date: "2026-05-18", amount: 528000, method: "계좌이체", memo: "완납" },
        ], createdAt: "2026-04-20T00:00:00.000Z",
      },
    ],
  };
}

export function getStore(): Store {
  if (!globalThis.__PAYMENT_STORE__) globalThis.__PAYMENT_STORE__ = seed();
  return globalThis.__PAYMENT_STORE__;
}

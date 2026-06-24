// 결제관리 시스템 도메인 타입.
//
// 핵심 흐름: 거래처(Client) → 청구(Charge) → 수금(Payment) 여러 건.
// 미수금(잔액) = 청구금액 − 수금합계. 상태는 수금/예정일로 자동 산출한다.

export interface PayClient {
  id: string;
  name: string;     // 거래처명
  contact: string;  // 담당자
  phone: string;
  note: string;
  createdAt: string;
}

// 수금 1건.
export type PaymentMethod = "계좌이체" | "현금" | "카드" | "기타";
export const PAYMENT_METHODS: PaymentMethod[] = ["계좌이체", "현금", "카드", "기타"];

export interface Payment {
  id: string;
  date: string;          // 입금일 (YYYY-MM-DD)
  amount: number;        // 수금액
  method: PaymentMethod;
  memo: string;
}

// 청구 1건 (= 미수 추적 단위).
export interface Charge {
  id: string;
  clientName: string;    // 거래처명
  chargeDate: string;    // 청구일 (YYYY-MM-DD)
  title: string;         // 내용 / 품목
  amount: number;        // 청구금액
  dueDate: string;       // 수금예정일 (YYYY-MM-DD, 선택)
  payments: Payment[];   // 수금 내역
  note: string;
  createdAt: string;
}

// 자동 산출 상태 — 화면 필터(전체/미수/부분수금/수금완료/연체)에 사용.
export type ChargeStatus = "미수" | "부분수금" | "수금완료" | "연체";
export const CHARGE_STATUSES: ChargeStatus[] = ["미수", "부분수금", "연체", "수금완료"];

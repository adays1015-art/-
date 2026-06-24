// 거래문서 도메인 타입 — 견적서·거래명세서·인보이스·발주서.
// 한 목록에 docType 으로 구분해 보관하고, 품목 라인을 가진다.

export type DocumentType = "견적서" | "거래명세서" | "인보이스" | "발주서";
export const DOCUMENT_TYPES: DocumentType[] = [
  "견적서", "거래명세서", "인보이스", "발주서",
];

export type DocumentStatus = "작성중" | "발행" | "취소";
export const DOCUMENT_STATUSES: DocumentStatus[] = ["작성중", "발행", "취소"];

// 부가세 처리: 별도(세액 가산) / 포함(역산) / 없음(면세·영세)
export type TaxMode = "별도" | "포함" | "없음";
export const TAX_MODES: TaxMode[] = ["별도", "포함", "없음"];

export interface DocumentLineItem {
  name: string;        // 품명
  spec?: string;       // 규격
  qty: number;         // 수량
  unit?: string;       // 단위
  unitPrice: number;   // 단가
  amount: number;      // 공급가액 = qty × unitPrice
  note?: string;
}

export interface BusinessDocument {
  id: string;
  docType: DocumentType;
  docNo: string;          // 문서번호 (예: Q-20260624-001)
  issueDate: string;      // 작성일 (YYYY-MM-DD)
  status: DocumentStatus;

  // 거래 상대
  clientName: string;     // 상호 (필수)
  clientBizNo?: string;   // 사업자등록번호
  clientContact?: string; // 담당자
  clientPhone?: string;
  clientAddress?: string;

  // 금액
  currency: string;       // KRW | USD …
  taxMode: TaxMode;
  taxRate: number;        // % (기본 10)
  items: DocumentLineItem[];
  subtotal: number;       // 공급가액 합계
  tax: number;            // 세액
  total: number;          // 합계금액

  note: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * 인메모리 저장소 (MVP).
 *
 * 구글 시트 연동 전 단계 — 서버 프로세스가 사는 동안만 데이터가 유지된다.
 * (재배포/재시작 시 샘플로 초기화) 화면 확정 후 동일한 service 인터페이스
 * 뒤에 Google Sheets 어댑터를 끼우면 된다.
 */
import type { BusinessDocument, CompanyInfo } from "@/types";
import { DEFAULT_COMPANY } from "@/lib/companyInfo";

type Store = { documents: BusinessDocument[]; company: CompanyInfo };

declare global {
  // eslint-disable-next-line no-var
  var __DOC_STORE__: Store | undefined;
}

function seed(): Store {
  return {
    documents: [
      {
        id: "DOC-1", docType: "견적서", docNo: "Q-20260624-001", issueDate: "2026-06-24",
        status: "발행", clientName: "(주)무지개상사", clientBizNo: "211-88-12345",
        clientContact: "김구매", clientPhone: "02-555-1234",
        clientAddress: "서울특별시 강남구 테헤란로 123, 8층",
        currency: "KRW", taxMode: "별도", taxRate: 10,
        items: [
          { name: "오일파스텔 24색 세트", spec: "선물용", qty: 100, unit: "개", unitPrice: 12000, amount: 1200000, note: "" },
          { name: "수채물감 12색", spec: "튜브형", qty: 50, unit: "개", unitPrice: 8000, amount: 400000, note: "" },
        ],
        subtotal: 1600000, tax: 160000, total: 1760000,
        note: "견적 유효기간: 발행일로부터 30일.", createdAt: "2026-06-24T00:00:00.000Z", updatedAt: "2026-06-24T00:00:00.000Z",
      },
      {
        id: "DOC-2", docType: "인보이스", docNo: "INV-20260620-001", issueDate: "2026-06-20",
        status: "발행", clientName: "Rainbow Trading Co., Ltd.", clientBizNo: "",
        clientContact: "John Lee", clientPhone: "+81-3-1234-5678",
        clientAddress: "1-2-3 Shibuya, Tokyo, Japan",
        currency: "USD", taxMode: "없음", taxRate: 0,
        items: [
          { name: "Oil Pastel Set 24 colors", spec: "Gift box", qty: 200, unit: "ea", unitPrice: 9.5, amount: 1900, note: "" },
        ],
        subtotal: 1900, tax: 0, total: 1900,
        note: "Payment term: T/T 30 days. Incoterms: FOB Busan.", createdAt: "2026-06-20T00:00:00.000Z", updatedAt: "2026-06-20T00:00:00.000Z",
      },
    ],
    company: { ...DEFAULT_COMPANY },
  };
}

export function getStore(): Store {
  if (!globalThis.__DOC_STORE__) globalThis.__DOC_STORE__ = seed();
  return globalThis.__DOC_STORE__;
}

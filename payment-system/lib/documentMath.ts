// 거래문서(견적서·거래명세서·인보이스·발주서) 금액 계산 — 서버/클라이언트 공용 순수 함수.
//
// 입력 라인의 단가·수량으로 공급가액(subtotal)·세액(tax)·합계(total)를 산출한다.
// 부가세 처리(taxMode)에 따라 계산 방식이 달라진다.
//
//   별도 = 단가는 공급가액 기준, 세액은 별도 가산        → total = subtotal + tax
//   포함 = 단가에 부가세가 포함되어 있어 역산             → total = 입력합계, subtotal = total - tax
//   없음 = 면세/영세                                      → tax = 0, total = subtotal
import type { BusinessDocument, DocumentLineItem, DocumentType, TaxMode } from "@/types";

export const DEFAULT_TAX_RATE = 10;

// 문서 종류별 번호 접두어.
export const DOC_PREFIX: Record<DocumentType, string> = {
  견적서: "Q",
  거래명세서: "T",
  인보이스: "INV",
  발주서: "PO",
};

/**
 * 문서번호 생성: `{PREFIX}-{YYYYMMDD}-{seq3}` (예: Q-20260624-001).
 * seq = 같은 종류·같은 날짜의 기존 문서 수 + 1. 순수 함수.
 */
export function generateDocNo(
  docType: DocumentType,
  issueDate: string,
  existingDocNos: string[],
): string {
  const prefix = DOC_PREFIX[docType] ?? "DOC";
  const ymd = String(issueDate ?? "").replace(/-/g, "").slice(0, 8);
  if (ymd.length !== 8) return "";
  const head = `${prefix}-${ymd}-`;
  const sameDay = existingDocNos.filter(
    (n) => typeof n === "string" && n.startsWith(head),
  );
  const seq = (sameDay.length + 1).toString().padStart(3, "0");
  return `${head}${seq}`;
}

const round = (n: number) => Math.round(n);

/** 라인 1줄의 공급가액 = 수량 × 단가 (음수 방지·NaN 방지). */
export function lineAmount(qty: number, unitPrice: number): number {
  const q = Number(qty) || 0;
  const p = Number(unitPrice) || 0;
  return round(q * p);
}

export interface DocumentTotals {
  subtotal: number; // 공급가액 합계
  tax: number;      // 세액
  total: number;    // 합계금액
}

/**
 * 라인 목록 + 부가세 설정으로 합계 3종을 계산한다.
 * items[].amount 는 신뢰하지 않고 qty×unitPrice 로 재계산한다.
 */
export function computeTotals(
  items: Pick<DocumentLineItem, "qty" | "unitPrice">[],
  taxMode: TaxMode,
  taxRate: number = DEFAULT_TAX_RATE,
): DocumentTotals {
  const rate = (Number(taxRate) || 0) / 100;
  const sum = items.reduce((s, it) => s + lineAmount(it.qty, it.unitPrice), 0);

  if (taxMode === "없음" || rate <= 0) {
    return { subtotal: sum, tax: 0, total: sum };
  }
  if (taxMode === "포함") {
    // 입력 단가에 세금이 포함됨 → 합계는 입력합계, 공급가/세액은 역산.
    const total = sum;
    const subtotal = round(total / (1 + rate));
    const tax = total - subtotal;
    return { subtotal, tax, total };
  }
  // 별도(기본)
  const subtotal = sum;
  const tax = round(subtotal * rate);
  return { subtotal, tax, total: subtotal + tax };
}

/** 라인의 amount 를 재계산해 채운 새 배열을 반환. */
export function withLineAmounts(items: DocumentLineItem[]): DocumentLineItem[] {
  return items.map((it) => ({ ...it, amount: lineAmount(it.qty, it.unitPrice) }));
}

/** 문서 전체(라인 amount + 합계)를 일관되게 다시 계산해 병합한다. */
export function recalcDocument<T extends Pick<
  BusinessDocument, "items" | "taxMode" | "taxRate"
>>(doc: T): T & DocumentTotals & { items: DocumentLineItem[] } {
  const items = withLineAmounts(doc.items ?? []);
  const totals = computeTotals(items, doc.taxMode, doc.taxRate);
  return { ...doc, items, ...totals };
}

// 거래문서(견적서·거래명세서·인보이스·발주서) A4 인쇄 헬퍼.
//
// 팝업 차단을 피하기 위해 새 창 대신 숨김 iframe 에 완성된 A4 문서를 써서
// 그 iframe 만 인쇄한다(라벨 인쇄와 동일한 방식). iframe 자체 @page(A4)
// 규칙이 적용되므로 화면의 다른 인쇄 설정과 충돌하지 않는다.
//
// 인보이스(영문)는 라벨/금액/통화 표기를 영어로 렌더링한다.
import type { BusinessDocument } from "@/types";
import { COMPANY, type CompanyInfo } from "@/lib/companyInfo";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

function fmtMoney(n: number, currency: string): string {
  const v = Math.round(Number(n) || 0);
  const grouped = v.toLocaleString("en-US");
  if (currency === "KRW") return `₩${grouped}`;
  if (currency === "USD") return `$${grouped}`;
  return `${grouped} ${esc(currency)}`;
}

const fmtNum = (n: number) => (Number(n) || 0).toLocaleString("en-US");

interface Labels {
  title: string;
  supplier: string;   // 공급자 박스 제목
  recipient: string;  // 상대방 박스 제목
  bizNo: string; ceo: string; addr: string; tel: string; email: string;
  contact: string;
  no: string; name: string; spec: string; qty: string; unit: string;
  price: string; amount: string; note: string;
  subtotal: string; tax: string; total: string;
  date: string; docNo: string;
  bankTitle: string; bank: string; account: string; holder: string; swift: string;
  noItems: string;
}

const KO: Labels = {
  title: "", supplier: "공급자", recipient: "받는 곳",
  bizNo: "사업자등록번호", ceo: "대표자", addr: "주소", tel: "전화", email: "이메일",
  contact: "담당자",
  no: "No", name: "품명", spec: "규격", qty: "수량", unit: "단위",
  price: "단가", amount: "공급가액", note: "비고",
  subtotal: "공급가액", tax: "부가세", total: "합계금액",
  date: "작성일", docNo: "문서번호",
  bankTitle: "입금계좌", bank: "은행", account: "계좌번호", holder: "예금주", swift: "",
  noItems: "품목이 없습니다.",
};

const EN: Labels = {
  title: "INVOICE", supplier: "Supplier", recipient: "Bill To",
  bizNo: "Business No.", ceo: "Representative", addr: "Address", tel: "Tel", email: "Email",
  contact: "Attn",
  no: "No", name: "Description", spec: "Spec", qty: "Qty", unit: "Unit",
  price: "Unit Price", amount: "Amount", note: "Remarks",
  subtotal: "Subtotal", tax: "VAT", total: "Total",
  date: "Date", docNo: "Invoice No.",
  bankTitle: "Bank Details", bank: "Bank", account: "Account No.", holder: "Account Holder", swift: "SWIFT",
  noItems: "No items.",
};

function buildHtml(doc: BusinessDocument, company: CompanyInfo): string {
  const isEn = doc.docType === "인보이스";
  const L = isEn ? { ...EN } : { ...KO, title: doc.docType };

  // 발주서: 우리가 '발주(구매)'하는 쪽 → 좌측에 받는 곳(공급처/거래처), 우측에 발주처(우리)를 표시.
  const isPO = doc.docType === "발주서";
  if (isPO) { L.supplier = "공급처"; L.recipient = "발주처"; }

  const us = {
    name: isEn ? (company.nameEn || company.name) : company.name,
    bizNo: company.bizNo, ceo: company.ceo,
    addr: isEn ? (company.addressEn || company.address) : company.address,
    tel: company.phone, email: company.email || "",
    contact: "",
  };
  const them = {
    name: doc.clientName,
    bizNo: doc.clientBizNo || "",
    ceo: "",
    addr: doc.clientAddress || "",
    tel: doc.clientPhone || "",
    email: "",
    contact: doc.clientContact || "",
  };

  // 발주서면 좌=거래처(them), 우=우리(us); 그 외엔 좌=우리(us), 우=거래처(them).
  const left = isPO ? them : us;
  const right = isPO ? us : them;
  const leftTitle = isPO ? L.supplier : L.supplier;   // 좌측 박스 제목
  const rightTitle = isPO ? L.recipient : L.recipient; // 우측 박스 제목
  // 라벨 의미: 일반 문서는 좌=공급자(우리), 우=받는 곳(거래처).
  //            발주서는 좌=공급처(거래처), 우=발주처(우리).
  const leftLabel = isPO ? "공급처" : L.supplier;
  const rightLabel = isPO ? "발주처" : L.recipient;

  const partyBox = (title: string, p: typeof us) => `
    <div class="party">
      <div class="party-title">${esc(title)}</div>
      <div class="party-name">${esc(p.name || "-")}</div>
      <table class="party-tbl">
        ${p.bizNo ? `<tr><th>${esc(L.bizNo)}</th><td>${esc(p.bizNo)}</td></tr>` : ""}
        ${p.ceo ? `<tr><th>${esc(L.ceo)}</th><td>${esc(p.ceo)}</td></tr>` : ""}
        ${p.addr ? `<tr><th>${esc(L.addr)}</th><td>${esc(p.addr)}</td></tr>` : ""}
        ${p.tel ? `<tr><th>${esc(L.tel)}</th><td>${esc(p.tel)}</td></tr>` : ""}
        ${p.email ? `<tr><th>${esc(L.email)}</th><td>${esc(p.email)}</td></tr>` : ""}
        ${p.contact ? `<tr><th>${esc(L.contact)}</th><td>${esc(p.contact)}</td></tr>` : ""}
      </table>
    </div>`;

  const items = doc.items ?? [];
  const rowsHtml = items.length
    ? items.map((it, i) => `
      <tr>
        <td class="c">${i + 1}</td>
        <td>${esc(it.name)}</td>
        <td class="c">${esc(it.spec || "")}</td>
        <td class="r">${fmtNum(it.qty)}</td>
        <td class="c">${esc(it.unit || "")}</td>
        <td class="r">${fmtMoney(it.unitPrice, doc.currency)}</td>
        <td class="r">${fmtMoney(it.amount, doc.currency)}</td>
        <td>${esc(it.note || "")}</td>
      </tr>`).join("")
    : `<tr><td class="c empty" colspan="8">${esc(L.noItems)}</td></tr>`;

  // 합계 표기 — 부가세 '없음'이면 세액 행 생략.
  const taxLabel = isEn ? `${L.tax} (${doc.taxRate}%)` : `${L.tax} (${doc.taxRate}%)`;
  const showTax = doc.taxMode !== "없음";

  const bankHtml = (company.bank || company.account) ? `
    <div class="bank">
      <div class="bank-title">${esc(L.bankTitle)}</div>
      <div class="bank-line">
        ${company.bank ? `${esc(L.bank)}: ${esc(company.bank)}` : ""}
        ${company.account ? ` · ${esc(L.account)}: ${esc(company.account)}` : ""}
        ${company.accountHolder ? ` · ${esc(L.holder)}: ${esc(company.accountHolder)}` : ""}
        ${isEn && company.swift ? ` · ${esc(L.swift)}: ${esc(company.swift)}` : ""}
      </div>
    </div>` : "";

  return `<!doctype html><html lang="${isEn ? "en" : "ko"}"><head><meta charset="utf-8">
<title>${esc(L.title)} ${esc(doc.docNo)}</title>
<style>
  @page { size: A4 portrait; margin: 16mm 14mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Noto Sans KR', 'Apple SD Gothic Neo', -apple-system, sans-serif;
    color: #1F1D1A; font-size: 11px; line-height: 1.45;
  }
  .doc { width: 100%; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
  .title { font-size: 30px; font-weight: 800; letter-spacing: ${isEn ? "1px" : "8px"}; }
  .meta { text-align: right; font-size: 10.5px; color: #57534E; }
  .meta b { color: #1F1D1A; font-weight: 700; }
  .parties { display: flex; gap: 10px; margin-bottom: 14px; }
  .party { flex: 1; border: 1px solid #D6D3CE; border-radius: 6px; padding: 9px 11px; }
  .party-title { font-size: 9px; font-weight: 700; letter-spacing: 1px; color: #8A857E; text-transform: uppercase; }
  .party-name { font-size: 14px; font-weight: 700; margin: 2px 0 6px; }
  .party-tbl { width: 100%; border-collapse: collapse; }
  .party-tbl th { text-align: left; color: #8A857E; font-weight: 500; width: 34%; padding: 1px 0; vertical-align: top; }
  .party-tbl td { padding: 1px 0; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 4px; }
  table.items th { background: #F5F3F0; border: 1px solid #D6D3CE; padding: 6px 7px; font-weight: 700; font-size: 10px; }
  table.items td { border: 1px solid #E7E4DF; padding: 6px 7px; }
  table.items td.c, table.items th.c { text-align: center; }
  table.items td.r { text-align: right; }
  table.items td.empty { text-align: center; color: #8A857E; padding: 20px; }
  .totals { display: flex; justify-content: flex-end; margin-top: 12px; }
  .totals table { border-collapse: collapse; min-width: 250px; }
  .totals th { text-align: left; color: #57534E; font-weight: 600; padding: 4px 14px 4px 0; }
  .totals td { text-align: right; padding: 4px 0; font-variant-numeric: tabular-nums; }
  .totals tr.grand th, .totals tr.grand td { border-top: 2px solid #1F1D1A; font-size: 15px; font-weight: 800; padding-top: 7px; }
  .note { margin-top: 16px; white-space: pre-wrap; color: #44403C; }
  .note-title { font-size: 9px; font-weight: 700; letter-spacing: 1px; color: #8A857E; text-transform: uppercase; margin-bottom: 3px; }
  .bank { margin-top: 12px; padding: 8px 11px; background: #FAF9F7; border: 1px solid #E7E4DF; border-radius: 6px; }
  .bank-title { font-size: 9px; font-weight: 700; letter-spacing: 1px; color: #8A857E; text-transform: uppercase; }
  .bank-line { margin-top: 2px; }
  .foot { margin-top: 22px; text-align: right; font-size: 12px; }
  .foot .company { font-weight: 700; font-size: 13px; }
  .foot .stamp { display: inline-block; margin-left: 6px; color: #8A857E; }
</style></head><body>
  <div class="doc">
    <div class="head">
      <div class="title">${esc(L.title)}</div>
      <div class="meta">
        <div>${esc(L.docNo)}: <b>${esc(doc.docNo || "-")}</b></div>
        <div>${esc(L.date)}: <b>${esc(doc.issueDate || "-")}</b></div>
        ${doc.currency && doc.currency !== "KRW" ? `<div>Currency: <b>${esc(doc.currency)}</b></div>` : ""}
      </div>
    </div>

    <div class="parties">
      ${partyBox(leftLabel, left)}
      ${partyBox(rightLabel, right)}
    </div>

    <table class="items">
      <thead>
        <tr>
          <th class="c" style="width:6%">${esc(L.no)}</th>
          <th style="width:28%">${esc(L.name)}</th>
          <th class="c" style="width:12%">${esc(L.spec)}</th>
          <th class="c" style="width:8%">${esc(L.qty)}</th>
          <th class="c" style="width:7%">${esc(L.unit)}</th>
          <th class="c" style="width:14%">${esc(L.price)}</th>
          <th class="c" style="width:15%">${esc(L.amount)}</th>
          <th style="width:10%">${esc(L.note)}</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>

    <div class="totals">
      <table>
        <tr><th>${esc(L.subtotal)}</th><td>${fmtMoney(doc.subtotal, doc.currency)}</td></tr>
        ${showTax ? `<tr><th>${esc(taxLabel)}</th><td>${fmtMoney(doc.tax, doc.currency)}</td></tr>` : ""}
        <tr class="grand"><th>${esc(L.total)}</th><td>${fmtMoney(doc.total, doc.currency)}</td></tr>
      </table>
    </div>

    ${doc.note ? `<div class="note"><div class="note-title">${isEn ? "Notes" : "비고"}</div>${esc(doc.note)}</div>` : ""}
    ${bankHtml}

    <div class="foot">
      <span class="company">${esc(us.name)}</span>
      <span class="stamp">${isEn ? "(Authorized Signature)" : "(인)"}</span>
    </div>
  </div>
</body></html>`;
}

export function printDocument(doc: BusinessDocument, company: CompanyInfo = COMPANY): void {
  const html = buildHtml(doc, company);

  const prev = document.getElementById("__doc_print_iframe");
  if (prev) prev.remove();

  const iframe = document.createElement("iframe");
  iframe.id = "__doc_print_iframe";
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, {
    position: "fixed", right: "0", bottom: "0",
    width: "0", height: "0", border: "0", visibility: "hidden",
  } as CSSStyleDeclaration);
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const docEl = iframe.contentWindow?.document;
  if (!win || !docEl) {
    alert("인쇄 준비에 실패했습니다. 페이지를 새로고침 후 다시 시도해주세요.");
    iframe.remove();
    return;
  }
  docEl.open();
  docEl.write(html);
  docEl.close();

  const fire = () => {
    try { win.focus(); win.print(); }
    finally { setTimeout(() => iframe.remove(), 1500); }
  };
  setTimeout(fire, 300);
}

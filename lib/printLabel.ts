// 50 × 20 mm 라벨 전용 인쇄 헬퍼.
// 팝업 차단에 걸리지 않도록 새 창(window.open) 대신 숨김 iframe 에 라벨 문서를
// 써서 그 iframe 만 인쇄한다. iframe 자체 @page(50×20) 규칙이 적용되므로 다른
// 화면(A4 인쇄)과 충돌하지 않는다.
export interface LotLabel {
  name: string;        // 제품명 (가장 큰 글씨)
  code: string;        // LOT 번호
  sub?: string;        // 날짜 등 보조 정보
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

export function printLotLabel(data: LotLabel): void {
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(data.code || data.name)}</title>
<style>
  @page { size: 50mm 20mm; margin: 0; }
  html, body { margin: 0; padding: 0; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .label {
    width: 50mm; height: 20mm; box-sizing: border-box;
    padding: 1.5mm 2mm; overflow: hidden;
    font-family: 'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif; color: #000;
    display: flex; flex-direction: column; justify-content: center;
  }
  .name {
    font-size: 12pt; font-weight: 800; line-height: 1.08;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .code { font-size: 8.5pt; font-weight: 600; margin-top: 0.6mm; }
  .sub  { font-size: 7.5pt; color: #333; margin-top: 0.3mm; }
</style></head><body>
  <div class="label">
    <div class="name">${esc(data.name || "-")}</div>
    ${data.code ? `<div class="code">${esc(data.code)}</div>` : ""}
    ${data.sub ? `<div class="sub">${esc(data.sub)}</div>` : ""}
  </div>
</body></html>`;

  // 기존 라벨 iframe 정리 후 새로 생성.
  const prev = document.getElementById("__lot_label_iframe");
  if (prev) prev.remove();

  const iframe = document.createElement("iframe");
  iframe.id = "__lot_label_iframe";
  iframe.setAttribute("aria-hidden", "true");
  Object.assign(iframe.style, {
    position: "fixed", right: "0", bottom: "0",
    width: "0", height: "0", border: "0", visibility: "hidden",
  } as CSSStyleDeclaration);
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = iframe.contentWindow?.document;
  if (!win || !doc) {
    alert("인쇄 준비에 실패했습니다. 페이지를 새로고침 후 다시 시도해주세요.");
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  const fire = () => {
    try {
      win.focus();
      win.print();
    } finally {
      // 인쇄 대화상자가 닫힌 뒤 정리.
      setTimeout(() => iframe.remove(), 1500);
    }
  };
  // 레이아웃이 잡힌 뒤 인쇄.
  setTimeout(fire, 250);
}

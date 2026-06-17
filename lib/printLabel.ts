// 50 × 20 mm 라벨 전용 인쇄 헬퍼.
// 전체 페이지(window.print)를 인쇄하면 @page 크기가 다른 화면(일일보고 A4 등)과
// 충돌하므로, 새 창에 라벨만 담아 @page size: 50mm 20mm 로 인쇄한다.
export interface LotLabel {
  title: string;       // 상단 소제목 (예: "B.fter · 품목 LOT")
  code: string;        // LOT 번호 (크게)
  lines: string[];     // 그 아래 짧은 정보 줄들
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

export function printLotLabel(data: LotLabel): void {
  const w = window.open("", "_blank", "width=420,height=260");
  if (!w) {
    alert("팝업이 차단되었습니다. 이 사이트의 팝업을 허용한 뒤 다시 시도해주세요.");
    return;
  }
  const linesHtml = data.lines.map((l) => `<div class="ln">${esc(l)}</div>`).join("");
  w.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(data.code)}</title>
<style>
  @page { size: 50mm 20mm; margin: 0; }
  html, body { margin: 0; padding: 0; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .label {
    width: 50mm; height: 20mm; box-sizing: border-box;
    padding: 1.2mm 2mm; overflow: hidden;
    font-family: 'Noto Sans KR', 'Apple SD Gothic Neo', monospace; color: #000;
  }
  .ttl { font-size: 5pt; letter-spacing: 0.6px; text-transform: uppercase; color: #555; }
  .code { font-size: 11pt; font-weight: 800; line-height: 1.02; letter-spacing: -0.3px; }
  .ln { font-size: 6.5pt; line-height: 1.18; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style></head><body>
  <div class="label">
    <div class="ttl">${esc(data.title)}</div>
    <div class="code">${esc(data.code)}</div>
    ${linesHtml}
  </div>
  <script>
    window.onload = function () {
      window.focus();
      window.print();
      setTimeout(function () { window.close(); }, 300);
    };
  </script>
</body></html>`);
  w.document.close();
}

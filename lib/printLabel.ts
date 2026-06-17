// 50 × 20 mm 라벨 전용 인쇄 헬퍼.
// 보관 용기에 붙여 "무엇인지" 한눈에 보이는 게 목적이므로, 제품명을 크게,
// 그 아래 LOT 번호와 날짜만 둔다(불필요한 항목 제거).
export interface LotLabel {
  name: string;        // 제품명 (가장 큰 글씨)
  code: string;        // LOT 번호
  sub?: string;        // 날짜 등 보조 정보
}

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

export function printLotLabel(data: LotLabel): void {
  const w = window.open("", "_blank", "width=420,height=260");
  if (!w) {
    alert("팝업이 차단되었습니다. 이 사이트의 팝업을 허용한 뒤 다시 시도해주세요.");
    return;
  }
  w.document.write(`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${esc(data.code || data.name)}</title>
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

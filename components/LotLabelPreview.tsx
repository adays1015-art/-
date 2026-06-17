"use client";

import type { LotLabel } from "@/lib/printLabel";

// 실제 인쇄 크기(50 × 20 mm)와 동일한 라벨 미리보기.
// 화면에서도 mm 단위로 렌더되어 출력물과 거의 동일하게 보인다.
export default function LotLabelPreview({ title, code, lines }: LotLabel) {
  return (
    <div className="flex flex-col items-center">
      <div
        className="border-2 border-ink-900 rounded bg-white font-mono text-ink-900 shadow-sm"
        style={{ width: "50mm", height: "20mm", boxSizing: "border-box", padding: "1.2mm 2mm", overflow: "hidden" }}
      >
        <div style={{ fontSize: "5pt", letterSpacing: "0.6px" }} className="uppercase text-ink-500">{title}</div>
        <div style={{ fontSize: "11pt", fontWeight: 800, lineHeight: 1.02, letterSpacing: "-0.3px" }}>{code}</div>
        {lines.map((l, i) => (
          <div key={i} style={{ fontSize: "6.5pt", lineHeight: 1.18, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l}</div>
        ))}
      </div>
      <div className="text-center text-[10px] text-ink-400 mt-2">실제 인쇄 크기 · 50 × 20 mm</div>
    </div>
  );
}

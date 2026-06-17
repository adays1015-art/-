"use client";

import type { LotLabel } from "@/lib/printLabel";

// 실제 인쇄 크기(50 × 20 mm)와 동일한 라벨 미리보기.
export default function LotLabelPreview({ name, code, sub }: LotLabel) {
  return (
    <div className="flex flex-col items-center">
      <div
        className="border-2 border-ink-900 rounded bg-white text-ink-900 shadow-sm flex flex-col justify-center"
        style={{ width: "50mm", height: "20mm", boxSizing: "border-box", padding: "1.5mm 2mm", overflow: "hidden" }}
      >
        <div
          style={{
            fontSize: "12pt", fontWeight: 800, lineHeight: 1.08,
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}
        >{name || "-"}</div>
        {code && <div style={{ fontSize: "8.5pt", fontWeight: 600, marginTop: "0.6mm" }}>{code}</div>}
        {sub && <div style={{ fontSize: "7.5pt", marginTop: "0.3mm" }} className="text-ink-600">{sub}</div>}
      </div>
      <div className="text-center text-[10px] text-ink-400 mt-2">실제 인쇄 크기 · 50 × 20 mm</div>
    </div>
  );
}

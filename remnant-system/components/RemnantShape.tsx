import type { Point } from "@/lib/types";
import { bbox, toSvgPath } from "@/lib/geometry";

// 잔재 외곽선 미리보기. 실제 비율 유지, 홀은 evenodd로 뚫는다.
export default function RemnantShape({
  outline, holes = [], size = 56, showDims = false,
}: {
  outline: Point[];
  holes?: Point[][];
  size?: number;
  showDims?: boolean;
}) {
  const b = bbox(outline);
  const pad = Math.max(b.width, b.height) * (showDims ? 0.14 : 0.04);
  const vb = `${b.minX - pad} ${b.minY - pad} ${b.width + pad * 2} ${b.height + pad * 2}`;
  const d = [outline, ...holes].map(toSvgPath).join(" ");
  const fs = Math.max(b.width, b.height) * 0.045;
  return (
    <svg viewBox={vb} width={size} height={size} role="img" aria-label={`잔재 형상 ${b.width}×${b.height}mm`}
      className="block" preserveAspectRatio="xMidYMid meet">
      {/* SVG y축은 아래로 향하므로 그대로 그려도 상면도와 일치 */}
      <path d={d} fillRule="evenodd" fill="#E7F1FB" stroke="#1A4FA0" strokeWidth={showDims ? 2 : 1.25} vectorEffect="non-scaling-stroke" />
      {showDims && (
        <g fill="#5B6B82" fontSize={fs} textAnchor="middle">
          <text x={b.minX + b.width / 2} y={b.minY - pad * 0.35}>{b.width} mm</text>
          <text x={b.maxX + pad * 0.5} y={b.minY + b.height / 2}
            transform={`rotate(90 ${b.maxX + pad * 0.5} ${b.minY + b.height / 2})`}>{b.height} mm</text>
        </g>
      )}
    </svg>
  );
}

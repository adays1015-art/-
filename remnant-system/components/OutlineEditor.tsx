"use client";

import { useRef, useState } from "react";
import type { Point } from "@/lib/types";

// 사진 위에 잔재 외곽선을 찍는 편집기.
// - 그리기: 모서리를 순서대로 탭 → 첫 점을 다시 탭하면 외곽선이 닫힌다
// - 닫힌 뒤: 빈 곳 탭 = 가장 가까운 변 위에 점 추가
// - 꼭짓점 드래그: 이동 / 탭: 선택 → 「선택 점 삭제」
// 좌표는 사진 픽셀 단위(viewBox). mm 변환은 등록 시 실제 가로·세로 입력값으로 한다.
// 4단계에서 AI 인식 결과가 이 편집기의 초기 외곽선으로 들어온다.

export default function OutlineEditor({
  width, height, photo, points, closed, onChange,
}: {
  width: number;
  height: number;
  photo: string | null;
  points: Point[];
  closed: boolean;
  onChange: (pts: Point[], closed: boolean) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ index: number; moved: boolean } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const r = Math.max(width, height) * 0.012;

  function toLocal(e: React.PointerEvent): Point {
    const svg = svgRef.current!;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM()!.inverse());
    return [Math.round(Math.min(width, Math.max(0, p.x))), Math.round(Math.min(height, Math.max(0, p.y)))];
  }

  function addPoint(p: Point) {
    if (!closed) {
      onChange([...points, p], false);
      setSelected(points.length);
      return;
    }
    // 가장 가까운 변을 찾아 그 사이에 삽입
    let best = 0, bestD = Infinity;
    for (let i = 0; i < points.length; i++) {
      const d = segDist(p, points[i], points[(i + 1) % points.length]);
      if (d < bestD) { bestD = d; best = i; }
    }
    const next = [...points];
    next.splice(best + 1, 0, p);
    onChange(next, true);
    setSelected(best + 1);
  }

  return (
    <div className="space-y-2">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto rounded-lg border border-border bg-bg-subtle touch-none select-none"
        onPointerDown={(e) => {
          if (e.target === svgRef.current || (e.target as Element).tagName === "image") addPoint(toLocal(e));
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          drag.current.moved = true;
          const next = [...points];
          next[drag.current.index] = toLocal(e);
          onChange(next, closed);
        }}
        onPointerUp={() => { drag.current = null; }}
        onPointerLeave={() => { drag.current = null; }}
      >
        {photo
          ? <image href={photo} x={0} y={0} width={width} height={height} preserveAspectRatio="none" />
          : <Grid width={width} height={height} />}
        {points.length >= 2 && (closed ? (
          <polygon
            points={points.map((p) => p.join(",")).join(" ")}
            fill="rgba(47,111,208,0.18)" stroke="#2F6FD0" strokeWidth={2} vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        ) : (
          <polyline
            points={points.map((p) => p.join(",")).join(" ")}
            fill="none" stroke="#2F6FD0" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke"
            pointerEvents="none"
          />
        ))}
        {points.map((p, i) => (
          <circle
            key={i} cx={p[0]} cy={p[1]} r={r}
            fill={i === selected ? "#F59E0B" : !closed && i === 0 && points.length >= 3 ? "#10B981" : "#FFFFFF"}
            stroke="#1A4FA0" strokeWidth={2} vectorEffect="non-scaling-stroke"
            className="cursor-grab"
            onPointerDown={(e) => {
              e.stopPropagation();
              // 그리는 중 첫 점을 다시 탭하면 외곽선을 닫는다
              if (!closed && i === 0 && points.length >= 3) {
                onChange(points, true);
                setSelected(null);
                return;
              }
              (e.target as Element).setPointerCapture?.(e.pointerId);
              drag.current = { index: i, moved: false };
              setSelected(i);
            }}
          />
        ))}
      </svg>

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-ghost" onClick={() => {
          onChange([[width * 0.15, height * 0.15], [width * 0.85, height * 0.15], [width * 0.85, height * 0.85], [width * 0.15, height * 0.85]].map(([x, y]) => [Math.round(x), Math.round(y)] as Point), true);
          setSelected(null);
        }}>사각형으로 시작</button>
        <button type="button" className="btn-ghost" disabled={selected === null}
          onClick={() => {
            if (selected === null) return;
            const next = points.filter((_, i) => i !== selected);
            onChange(next, closed && next.length >= 3);
            setSelected(null);
          }}>선택 점 삭제</button>
        <button type="button" className="btn-ghost" disabled={!points.length}
          onClick={() => { onChange([], false); setSelected(null); }}>모두 지우기</button>
        {!closed && points.length >= 3 && (
          <button type="button" className="btn-ghost" onClick={() => { onChange(points, true); setSelected(null); }}>외곽선 닫기</button>
        )}
        <span className="self-center text-xs text-ink-500">
          꼭짓점 {points.length}개 · {closed ? "닫힘 (변 근처를 탭하면 점 추가)" : points.length >= 3 ? "그리는 중 (초록 첫 점을 탭하면 닫힘)" : "그리는 중"}
        </span>
      </div>
    </div>
  );
}

function segDist(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function Grid({ width, height }: { width: number; height: number }) {
  const step = Math.max(width, height) / 20;
  const xs = Array.from({ length: Math.floor(width / step) + 1 }, (_, i) => i * step);
  const ys = Array.from({ length: Math.floor(height / step) + 1 }, (_, i) => i * step);
  return (
    <g stroke="#DCE3EE" strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none">
      {xs.map((x) => <line key={`x${x}`} x1={x} x2={x} y1={0} y2={height} />)}
      {ys.map((y) => <line key={`y${y}`} x1={0} x2={width} y1={y} y2={y} />)}
    </g>
  );
}

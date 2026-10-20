import type { Point } from "./types";

// 신발끈 공식 — 외곽선 면적(mm²). 방향과 무관하게 양수.
export function polygonArea(pts: Point[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

export function bbox(pts: Point[]) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const maxX = Math.max(...xs), maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

// 순면적 = 외곽선 − 홀
export function netArea(outline: Point[], holes: Point[][]): number {
  return polygonArea(outline) - holes.reduce((s, h) => s + polygonArea(h), 0);
}

const STEEL_DENSITY_KG_PER_MM3 = 7.85e-6; // 7.85 g/cm³

export function steelWeightKg(areaMm2: number, thicknessMm: number): number {
  return areaMm2 * thicknessMm * STEEL_DENSITY_KG_PER_MM3;
}

export function circle(cx: number, cy: number, r: number, n = 16): Point[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [Math.round(cx + r * Math.cos(a)), Math.round(cy + r * Math.sin(a))] as Point;
  });
}

export function toSvgPath(pts: Point[]): string {
  return pts.map((p, i) => `${i ? "L" : "M"}${p[0]} ${p[1]}`).join(" ") + " Z";
}

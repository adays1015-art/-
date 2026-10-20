"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";
import OutlineEditor from "@/components/OutlineEditor";
import RemnantShape from "@/components/RemnantShape";
import { bbox, polygonArea, steelWeightKg } from "@/lib/geometry";
import { MATERIALS, THICKNESSES, RACK_ROWS } from "@/lib/catalog";
import type { Point } from "@/lib/types";

const MAX_SIDE = 1280;
const BLANK = { width: 1000, height: 700 };

// 사진을 긴 변 1280px JPEG로 줄여 data URL로 만든다 (업로드 용량 절감)
async function shrink(file: File): Promise<{ url: string; width: number; height: number }> {
  const src = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = src;
    });
    const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * k), h = Math.round(img.naturalHeight * k);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    c.getContext("2d")!.drawImage(img, 0, 0, w, h);
    return { url: c.toDataURL("image/jpeg", 0.75), width: w, height: h };
  } finally {
    URL.revokeObjectURL(src);
  }
}

// 사진 좌표 외곽선 → 실제 외접 가로·세로(mm)에 맞춰 mm 좌표로 변환, 원점 (0,0)
export function toMm(pts: Point[], widthMm: number, heightMm: number): Point[] {
  if (pts.length < 3 || !(widthMm > 0) || !(heightMm > 0)) return [];
  const b = bbox(pts);
  if (!b.width || !b.height) return [];
  return pts.map(([x, y]) => [Math.round(((x - b.minX) / b.width) * widthMm), Math.round(((y - b.minY) / b.height) * heightMm)] as Point);
}

export default function RegisterForm({ suggestedId }: { suggestedId: string }) {
  const router = useRouter();
  const [photo, setPhoto] = useState<{ url: string; width: number; height: number } | null>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [closed, setClosed] = useState(false);
  const [engravedId, setEngravedId] = useState(suggestedId);
  const [material, setMaterial] = useState(MATERIALS[0]);
  const [thickness, setThickness] = useState<number>(12);
  const [widthMm, setWidthMm] = useState("");
  const [heightMm, setHeightMm] = useState("");
  const [rackRow, setRackRow] = useState(RACK_ROWS[0]);
  const [rackNo, setRackNo] = useState("01");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const canvas = photo ?? BLANK;
  const outlineMm = useMemo(() => (closed ? toMm(points, Number(widthMm), Number(heightMm)) : []), [closed, points, widthMm, heightMm]);
  const areaMm2 = outlineMm.length ? polygonArea(outlineMm) : 0;
  const weightKg = steelWeightKg(areaMm2, thickness);

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setError(null);
    try {
      const p = await shrink(f);
      setPhoto(p);
      setPoints([]);
      setClosed(false);
    } catch {
      setError("사진을 읽지 못했습니다. 다른 사진으로 시도하세요.");
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (points.length < 3) return setError("사진 위에 외곽선 꼭짓점을 3개 이상 찍으세요.");
    if (!closed) return setError("첫 점을 다시 탭해 외곽선을 닫으세요.");
    if (!outlineMm.length) return setError("실제 가로·세로 치수(mm)를 입력하세요.");
    setSaving(true);
    try {
      const res = await fetch("/api/remnants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          engravedId, material, thicknessMm: thickness, outline: outlineMm,
          rack: `${rackRow}-${rackNo}`, photo: photo?.url ?? null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `저장 실패 (${res.status})`);
      router.push(`/remnants/${data.id}?registered=1`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장에 실패했습니다.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <section className="panel panel-pad lg:col-span-3 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="panel-title">1. 사진 · 외곽선</div>
          <label className="btn-primary cursor-pointer">
            <Camera size={16} /> {photo ? "다시 촬영" : "사진 촬영"}
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhoto} />
          </label>
        </div>
        <p className="text-xs text-ink-500">
          잔재를 위에서 내려다보고 찍은 뒤, 모서리를 한 방향으로 차례로 탭하고 첫 점(초록)을 다시 탭해 닫으세요. 점은 끌어서 옮길 수 있고, 닫은 뒤 변 근처를 탭하면 점이 추가됩니다.
          {!photo && " 사진 없이 모눈 위에 그려도 됩니다."}
        </p>
        <OutlineEditor width={canvas.width} height={canvas.height} photo={photo?.url ?? null} points={points} closed={closed}
          onChange={(pts, c) => { setPoints(pts); setClosed(c); }} />
      </section>

      <section className="lg:col-span-2 space-y-4">
        <div className="panel panel-pad space-y-3">
          <div className="panel-title">2. 실제 치수</div>
          <p className="text-xs text-ink-500">외곽선을 감싸는 사각형의 실제 가로·세로를 줄자로 재서 입력하세요. AI 인식(4단계)이 붙으면 자동으로 채워집니다.</p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="가로 (mm)"><input className="input" inputMode="numeric" value={widthMm} onChange={(e) => setWidthMm(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="예: 1230" required /></Field>
            <Field label="세로 (mm)"><input className="input" inputMode="numeric" value={heightMm} onChange={(e) => setHeightMm(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="예: 690" required /></Field>
          </div>
        </div>

        <div className="panel panel-pad space-y-3">
          <div className="panel-title">3. 잔재 정보</div>
          <Field label="각인 ID"><input className="input font-mono" value={engravedId} onChange={(e) => setEngravedId(e.target.value)} required /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="재질">
              <select className="input" value={material} onChange={(e) => setMaterial(e.target.value)}>
                {MATERIALS.map((m) => <option key={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="두께 (mm)">
              <select className="input" value={thickness} onChange={(e) => setThickness(Number(e.target.value))}>
                {THICKNESSES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
          </div>
          <Field label="적치 위치">
            <div className="grid grid-cols-2 gap-3">
              <select className="input" value={rackRow} onChange={(e) => setRackRow(e.target.value)}>
                {RACK_ROWS.map((r) => <option key={r} value={r}>{r}열</option>)}
              </select>
              <select className="input" value={rackNo} onChange={(e) => setRackNo(e.target.value)}>
                {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((n) => <option key={n} value={n}>{n}번</option>)}
              </select>
            </div>
          </Field>
        </div>

        <div className="panel panel-pad">
          <div className="panel-title mb-3">확인</div>
          <div className="flex items-center gap-4">
            <div className="shrink-0 rounded-md border border-border bg-bg-subtle p-1">
              {outlineMm.length ? <RemnantShape outline={outlineMm} size={88} /> : <div className="w-[88px] h-[88px]" />}
            </div>
            <dl className="grid grid-cols-[56px_1fr] gap-y-1 text-sm">
              <dt className="text-ink-500">면적</dt><dd className="tabular-nums">{areaMm2 ? `${(areaMm2 / 1e6).toFixed(3)} ㎡` : "—"}</dd>
              <dt className="text-ink-500">중량</dt><dd className="tabular-nums">{areaMm2 ? `${weightKg.toFixed(1)} kg` : "—"}</dd>
              <dt className="text-ink-500">위치</dt><dd>{rackRow}-{rackNo}</dd>
            </dl>
          </div>
          {error && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={saving} className="btn-primary w-full justify-center mt-4 py-2.5 text-base disabled:opacity-60">
            {saving ? "저장 중…" : "잔재 등록"}
          </button>
        </div>
      </section>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label">{label}</div>
      {children}
    </div>
  );
}

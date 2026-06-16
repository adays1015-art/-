"use client";

import { useMemo, useRef, useState } from "react";
import { Plus, Trash2, ImageUp, ArrowLeftRight } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import Modal from "@/components/Modal";
import type { TestResult } from "@/types";
import { formatDate, todayISO } from "@/lib/utils";
import { useCanEdit, PERMISSION_TIP } from "@/components/useRole";
import { useResourceSave } from "@/hooks/useResourceSave";
import SaveErrorPanel from "@/components/SaveErrorPanel";
import { useRouter } from "next/navigation";

type EditableResult = Omit<TestResult, "id" | "status">;

function emptyResult(): EditableResult {
  return {
    date: todayISO(), title: "", itemNo: "", assignee: "",
    result: "", note: "", imageData: "",
  };
}

// 구글시트 셀 한도(5만자) 안에 들어오도록 클라이언트에서 리사이즈+압축.
// 한도 내로 들어올 때까지 점진적으로 크기·품질을 낮춘다.
const CELL_LIMIT = 48000;

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

async function compressImage(file: File): Promise<{ dataUrl: string; warn?: string }> {
  const img = await loadImage(file);
  let maxDim = 900;
  let best = "";
  for (let dimStep = 0; dimStep < 8; dimStep++) {
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) break;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    for (let q = 0.72; q >= 0.3; q -= 0.12) {
      const dataUrl = canvas.toDataURL("image/jpeg", q);
      best = dataUrl;
      if (dataUrl.length <= CELL_LIMIT) return { dataUrl };
    }
    maxDim = Math.round(maxDim * 0.78);
  }
  return {
    dataUrl: best,
    warn: best.length > CELL_LIMIT
      ? "이미지가 너무 커서 더 작게 압축했지만 한도를 넘을 수 있습니다. 더 작은/단순한 이미지를 권장합니다."
      : undefined,
  };
}

export default function TestResultsClient({ initial }: { initial: TestResult[] }) {
  const router = useRouter();
  const [items, setItems] = useState<TestResult[]>(initial);
  const canEdit = useCanEdit("test-results");
  const [editing, setEditing] = useState<EditableResult | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [imgWarn, setImgWarn] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { save, saving, error: saveError, clearError } = useResourceSave("/api/test-results");

  // Before/After 비교 슬롯 — 저장된 결과 id 2개.
  const [leftId, setLeftId] = useState<string>("");
  const [rightId, setRightId] = useState<string>("");
  const left = useMemo(() => items.find((t) => t.id === leftId) ?? null, [items, leftId]);
  const right = useMemo(() => items.find((t) => t.id === rightId) ?? null, [items, rightId]);

  async function onPickImage(file: File) {
    setImgWarn(null);
    setCompressing(true);
    try {
      const { dataUrl, warn } = await compressImage(file);
      setEditing((p) => (p ? { ...p, imageData: dataUrl } : p));
      if (warn) setImgWarn(warn);
    } catch {
      setImgWarn("이미지를 읽지 못했습니다. 다른 파일을 시도해주세요.");
    } finally {
      setCompressing(false);
    }
  }

  async function onSave() {
    if (!editing) return;
    const res = await save<TestResult>("POST", editing);
    if (!res.ok) return;
    try {
      const fresh = await (await fetch("/api/test-results")).json();
      if (Array.isArray(fresh.data)) setItems(fresh.data);
    } catch { /* keep stale */ }
    router.refresh();
    setEditing(null);
  }

  async function onDelete(id: string) {
    if (!confirm("이 테스트 결과를 삭제할까요?")) return;
    await fetch(`/api/test-results?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setItems((p) => p.filter((t) => t.id !== id));
    if (leftId === id) setLeftId("");
    if (rightId === id) setRightId("");
    router.refresh();
  }

  function placeNextSlot(id: string) {
    if (!leftId) { setLeftId(id); return; }
    if (!rightId) { setRightId(id); return; }
    // 둘 다 차있으면 오른쪽을 교체
    setRightId(id);
  }

  return (
    <div>
      <PageHeader
        title="테스트 결과"
        description="샘플/배치 테스트를 이미지와 함께 기록하고, 두 결과를 나란히(Before/After) 비교합니다. 이미지는 자동 압축되어 저장됩니다."
        actions={
          <button className="btn-primary" onClick={() => { setEditing(emptyResult()); setImgWarn(null); clearError(); }}
            disabled={!canEdit} title={!canEdit ? PERMISSION_TIP : undefined}
          ><Plus size={14} /> 테스트 결과 등록</button>
        }
      />

      {/* ─── 비교 패널 (Before/After) ─────────────────────────── */}
      <div className="panel panel-pad mb-6">
        <div className="flex items-center gap-2 mb-3 text-sm font-semibold text-ink-900">
          <ArrowLeftRight size={15} /> 비교 (Before / After)
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {([["왼쪽", leftId, setLeftId, left], ["오른쪽", rightId, setRightId, right]] as const).map(
            ([label, id, setId, slot]) => (
              <div key={label} className="rounded-xl border border-border bg-bg-panel p-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-medium text-ink-600 w-10">{label}</span>
                  <select className="input flex-1" value={id}
                    onChange={(e) => setId(e.target.value)}>
                    <option value="">선택...</option>
                    {items.map((t) => (
                      <option key={t.id} value={t.id}>
                        {formatDate(t.date)} · {t.title || "(제목 없음)"}
                      </option>
                    ))}
                  </select>
                </div>
                {slot ? (
                  <div>
                    {slot.imageData
                      ? <img src={slot.imageData} alt={slot.title}
                          className="w-full h-64 object-contain rounded-md bg-bg-subtle border border-border" />
                      : <div className="w-full h-64 flex items-center justify-center rounded-md bg-bg-subtle border border-border text-ink-400 text-sm">이미지 없음</div>}
                    <div className="mt-2 space-y-1 text-sm">
                      <div className="font-semibold text-ink-900">{slot.title}</div>
                      <div className="text-ink-500 text-xs">
                        {formatDate(slot.date)}{slot.itemNo ? ` · 품목 ${slot.itemNo}` : ""}{slot.assignee ? ` · ${slot.assignee}` : ""}
                      </div>
                      {slot.result && <div><span className="text-ink-500 text-xs">결과: </span>{slot.result}</div>}
                      {slot.note && <div className="text-ink-600 text-xs whitespace-pre-wrap">{slot.note}</div>}
                    </div>
                  </div>
                ) : (
                  <div className="w-full h-64 flex items-center justify-center rounded-md bg-bg-subtle border border-dashed border-border text-ink-400 text-sm">
                    아래 목록에서 선택하거나 위에서 고르세요
                  </div>
                )}
              </div>
            ),
          )}
        </div>
      </div>

      {/* ─── 결과 목록 (갤러리) ───────────────────────────────── */}
      {items.length === 0 ? (
        <div className="panel panel-pad text-center text-sm text-ink-500 py-10">
          등록된 테스트 결과가 없습니다. 우측 상단 “테스트 결과 등록”으로 추가하세요.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map((t) => (
            <div key={t.id} className="rounded-xl border border-border bg-bg-panel overflow-hidden flex flex-col">
              {t.imageData
                ? <img src={t.imageData} alt={t.title} className="w-full h-40 object-cover bg-bg-subtle" />
                : <div className="w-full h-40 flex items-center justify-center bg-bg-subtle text-ink-400 text-xs">이미지 없음</div>}
              <div className="p-3 flex-1 flex flex-col">
                <div className="font-semibold text-sm text-ink-900 truncate">{t.title || "(제목 없음)"}</div>
                <div className="text-[11px] text-ink-500">
                  {formatDate(t.date)}{t.itemNo ? ` · 품목 ${t.itemNo}` : ""}
                </div>
                {t.result && <div className="text-xs text-ink-700 mt-1 line-clamp-2">{t.result}</div>}
                <div className="mt-auto pt-2 flex items-center gap-1">
                  <button className="btn-ghost text-[11px] flex-1" onClick={() => placeNextSlot(t.id)}>
                    비교에 추가
                  </button>
                  {canEdit && (
                    <button className="btn-ghost text-red-600 px-1.5" title="삭제"
                      onClick={() => onDelete(t.id)}><Trash2 size={13} /></button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── 등록 모달 ────────────────────────────────────────── */}
      <Modal open={!!editing} onClose={() => { setEditing(null); clearError(); }}
        title="테스트 결과 등록"
        footer={<>
          <button className="btn-ghost" onClick={() => { setEditing(null); clearError(); }}>취소</button>
          <button className="btn-primary" onClick={onSave} disabled={saving || compressing || !canEdit}
            title={!canEdit ? PERMISSION_TIP : undefined}>{saving ? "저장 중..." : "저장"}</button>
        </>}>
        <SaveErrorPanel error={saveError} onClose={clearError} />
        {editing && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">테스트일</label>
                <input className="input" type="date" value={editing.date}
                  onChange={(e) => setEditing({ ...editing, date: e.target.value })} /></div>
              <div><label className="label">작성자</label>
                <input className="input" value={editing.assignee}
                  onChange={(e) => setEditing({ ...editing, assignee: e.target.value })} /></div>
              <div className="col-span-2"><label className="label">테스트명 / 샘플명</label>
                <input className="input" value={editing.title} placeholder="예: 립스틱 업사이클 1차 발색"
                  onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></div>
              <div><label className="label">대상 품목번호 (선택)</label>
                <input className="input" value={editing.itemNo}
                  onChange={(e) => setEditing({ ...editing, itemNo: e.target.value })} /></div>
              <div><label className="label">결과 / 평가</label>
                <input className="input" value={editing.result} placeholder="예: 양호 / 발색 우수"
                  onChange={(e) => setEditing({ ...editing, result: e.target.value })} /></div>
              <div className="col-span-2"><label className="label">메모</label>
                <textarea className="input min-h-[60px]" value={editing.note}
                  onChange={(e) => setEditing({ ...editing, note: e.target.value })} /></div>
            </div>

            <div>
              <label className="label">이미지</label>
              <input ref={fileRef} type="file" accept="image/*" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickImage(f); }} />
              <div className="flex items-center gap-3">
                <button type="button" className="btn-ghost" disabled={compressing}
                  onClick={() => fileRef.current?.click()}>
                  <ImageUp size={14} /> {compressing ? "압축 중..." : "이미지 선택"}
                </button>
                {editing.imageData && (
                  <button type="button" className="text-xs text-red-600"
                    onClick={() => setEditing({ ...editing, imageData: "" })}>제거</button>
                )}
              </div>
              {editing.imageData && (
                <img src={editing.imageData} alt="미리보기"
                  className="mt-2 w-full max-h-64 object-contain rounded-md bg-bg-subtle border border-border" />
              )}
              {imgWarn && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mt-2">{imgWarn}</div>
              )}
              <div className="text-[11px] text-ink-500 mt-1">
                업로드 시 자동으로 리사이즈·압축되어 저장됩니다(시트 셀 한도 내).
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

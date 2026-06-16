"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Trash2, Save, Search, Copy, BookmarkPlus } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Table, THead, TBody, TR, TH, TD, Empty } from "@/components/Table";
import type { Item, ItemBomLine, Material, MaterialCategory } from "@/types";
import { formatNumber, formatCurrency } from "@/lib/utils";
import { useCanEdit, PERMISSION_TIP } from "@/components/useRole";
import { usageUnitFor, unitConsistencyWarning } from "@/lib/units";
import { useResourceSave } from "@/hooks/useResourceSave";
import SaveErrorPanel from "@/components/SaveErrorPanel";

export default function UpcycleBomClient({
  initialBom,
  items,
  materials,
  templateNames,
}: {
  initialBom: ItemBomLine[];
  items: Item[];
  materials: Material[];
  templateNames: string[];
}) {
  const [bom, setBom] = useState<ItemBomLine[]>(initialBom);
  const canEditBom = useCanEdit("upcycle-bom");
  const canDelete = useCanEdit("delete");
  const [selectedItemNo, setSelectedItemNo] = useState<string>(items[0]?.itemNo ?? "");
  const [q, setQ] = useState("");
  const { save, error: saveError, clearError, retry, saving } = useResourceSave("/api/upcycle-bom");

  // ─── Template-apply dialog state ──────────────────────────
  const [tplOpen, setTplOpen] = useState(false);
  const [tplName, setTplName] = useState<string>(templateNames[0] ?? "");
  const [tplMode, setTplMode] = useState<"append" | "overwrite">("append");
  const [tplResult, setTplResult] = useState<{
    created: number; skipped: number; effectiveMode: string; warning?: string;
  } | null>(null);
  const [tplApplying, setTplApplying] = useState(false);
  const [tplError, setTplError] = useState<string | null>(null);

  // ─── Save-current-BOM-as-template dialog state ──────────
  const [saveTplOpen, setSaveTplOpen] = useState(false);
  const [saveTplName, setSaveTplName] = useState<string>("");
  const [saveTplCount, setSaveTplCount] = useState<number | null>(null);
  const [saveTplBusy, setSaveTplBusy] = useState(false);
  const [saveTplError, setSaveTplError] = useState<string | null>(null);

  async function applyTemplate() {
    if (!selectedItemNo || !tplName) return;
    if (tplMode === "overwrite") {
      const ok = confirm(
        `정말 ${selectedItemNo}번 품목의 기존 BOM을 삭제하고 '${tplName}' 템플릿을 적용하시겠습니까?\n` +
        "Google Sheets 모드에서는 기존 행이 자동 삭제되지 않으며 '기존 유지 + 추가'로 동작합니다.",
      );
      if (!ok) return;
    }
    setTplApplying(true);
    setTplError(null);
    setTplResult(null);
    try {
      const res = await fetch("/api/bom-template/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemNo: selectedItemNo, templateName: tplName, mode: tplMode }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setTplError(json.error ?? `HTTP ${res.status}`);
        return;
      }
      const data = json.data ?? {};
      const createdRows: ItemBomLine[] = Array.isArray(data.created) ? data.created : [];
      setTplResult({
        created: createdRows.length,
        skipped: (data.skipped ?? []).length,
        effectiveMode: data.effectiveMode ?? tplMode,
        warning: data.warning,
      });
      // Merge the server-returned rows straight into local state — no full
      // refetch, no router.refresh(). If the user retries, dedupe by id.
      if (createdRows.length > 0) {
        setBom((prev) => {
          const existingIds = new Set(prev.map((b) => b.id));
          return [...prev, ...createdRows.filter((r) => !existingIds.has(r.id))];
        });
      }
    } catch (err) {
      setTplError((err as Error).message);
    } finally {
      setTplApplying(false);
    }
  }

  async function saveBomAsTemplate() {
    if (!selectedItemNo) return;
    const name = saveTplName.trim();
    if (!name) {
      setSaveTplError("템플릿 이름을 입력하세요.");
      return;
    }
    setSaveTplBusy(true);
    setSaveTplError(null);
    setSaveTplCount(null);
    try {
      const res = await fetch("/api/bom-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createFromBom",
          itemNo: selectedItemNo,
          templateName: name,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        setSaveTplError(json.error ?? `HTTP ${res.status}`);
        return;
      }
      const created = Array.isArray(json.data) ? json.data.length : 0;
      setSaveTplCount(created);
      // Reset name so the dialog can be reused.
      setSaveTplName("");
    } catch (err) {
      setSaveTplError((err as Error).message);
    } finally {
      setSaveTplBusy(false);
    }
  }

  const visibleItems = useMemo(() =>
    items
      .filter((i) => !q || `${i.itemNo} ${i.colorName}`.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => Number(a.itemNo) - Number(b.itemNo)),
  [items, q]);

  const selected = items.find((i) => i.itemNo === selectedItemNo);
  const lines = bom.filter((b) => b.itemNo === selectedItemNo);

  // ─── Material option helpers ───────────────────────────
  // Stable key for a material — used as both <option value> and React key.
  // Sheet column `id` is often empty, so we fall back to materialCode then
  // materialName so each option gets a *distinct* value.
  function materialKey(m: Material, idx?: number): string {
    return m.id || m.materialCode || m.materialName || m.name || (idx != null ? `__idx-${idx}` : "");
  }
  function materialLabel(m: Material): string {
    const name = m.materialName || m.name || m.id || "(이름 없음)";
    const code = m.materialCode && m.materialCode !== m.id ? ` · ${m.materialCode}` : "";
    const useUnit = usageUnitFor(m);
    const buyUnit = m.unit || "—";
    const unitInfo = useUnit && useUnit !== buyUnit
      ? ` · 구입 ${buyUnit} → 사용 ${useUnit}`
      : useUnit
        ? ` · 사용 ${useUnit}`
        : "";
    const priceInfo = m.unitCost && useUnit
      ? ` · ${formatCurrency(m.unitCost)}/${useUnit}`
      : "";
    const src = m.source === "기존" ? "기존·" : m.source === "업사이클" ? "" : "";
    return `[${src}${m.category}] ${name}${code}${unitInfo}${priceInfo}`;
  }
  // Locate the material the row currently references — tries materialId, then
  // materialCode, then materialName so existing rows keep their selection even
  // when one of those identifiers is empty in the sheet.
  function findMaterialForLine(l: ItemBomLine): Material | undefined {
    if (l.materialId) {
      const m = materials.find((x) => x.id === l.materialId);
      if (m) return m;
    }
    if (l.materialCode) {
      const m = materials.find((x) => x.materialCode === l.materialCode);
      if (m) return m;
    }
    if (l.materialName) {
      const m = materials.find((x) => (x.materialName || x.name) === l.materialName);
      if (m) return m;
    }
    return undefined;
  }

  async function refetchBom() {
    try {
      const j = await (await fetch("/api/upcycle-bom")).json();
      if (Array.isArray(j.data)) setBom(j.data);
    } catch { /* ignore */ }
  }

  async function addLine() {
    if (!selected) return;
    // Optimistic placeholder row — replace with the server-issued row once it
    // returns. If save fails, drop the placeholder.
    const tempId = `__tmp-${Date.now()}`;
    const placeholder: ItemBomLine = {
      id: tempId,
      itemNo: selected.itemNo,
      materialId: "",
      materialCode: "",
      materialName: "",
      materialCategory: "기타",
      amountPerUnit: 0,
      unit: "",
      note: "",
    };
    setBom((p) => [...p, placeholder]);
    const res = await save<ItemBomLine>("POST", {
      itemNo: selected.itemNo,
      materialId: "",
      materialCode: "",
      materialName: "",
      materialCategory: "기타",
      amountPerUnit: 0,
      unit: "",
      note: "",
    });
    if (!res.ok) {
      setBom((p) => p.filter((b) => b.id !== tempId));
      return;
    }
    const created = res.data;
    if (created && created.id) {
      setBom((p) => p.map((b) => (b.id === tempId ? created : b)));
    } else {
      // Server didn't return the created row — fall back to targeted refetch.
      await refetchBom();
    }
  }

  function updateLine(b: ItemBomLine, patch: Partial<ItemBomLine>) {
    const merged = { ...b, ...patch };
    setBom((p) => p.map((x) => (x.id === b.id ? merged : x)));
  }

  async function persistLine(b: ItemBomLine) {
    // updateLine() already applied the change to local state optimistically.
    // The server-issued copy is the source of truth; if it differs we'll see
    // it the next time the user navigates. No background refetch needed.
    const snapshot = bom;
    const res = await save("PATCH", b);
    if (!res.ok) setBom(snapshot);
  }

  async function removeLine(b: ItemBomLine) {
    if (!confirm("이 BOM 라인을 삭제하시겠습니까?")) return;
    const snapshot = bom;
    // Optimistic remove.
    setBom((p) => p.filter((x) => x.id !== b.id));
    const res = await save("DELETE", undefined, `id=${encodeURIComponent(b.id)}`);
    if (!res.ok) setBom(snapshot);
  }

  const totalsByCategory = useMemo(() => {
    const map = new Map<MaterialCategory, number>();
    for (const l of lines) {
      map.set(l.materialCategory, (map.get(l.materialCategory) ?? 0) + l.amountPerUnit);
    }
    return Array.from(map.entries());
  }, [lines]);

  return (
    <div>
      <PageHeader
        title="업사이클 BOM"
        description="업사이클 품목별 자재명세서. 업사이클·기존 원료재고를 함께 선택할 수 있으며, 생산 시 각 원료의 출처 재고(업사이클/기존)에서 실투입량만큼 자동 차감됩니다."
      />

      <div className="grid grid-cols-12 gap-4">
        {/* Item picker */}
        <div className="col-span-12 md:col-span-4 xl:col-span-3">
          <div className="panel">
            <div className="px-3 py-2 border-b border-border">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
                <input className="input pl-8" placeholder="품목 검색"
                  value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-2 space-y-1">
              {visibleItems.length === 0 && <div className="text-sm text-ink-500 p-3 text-center">결과 없음</div>}
              {visibleItems.map((it) => {
                const active = it.itemNo === selectedItemNo;
                return (
                  <button key={it.id}
                    onClick={() => setSelectedItemNo(it.itemNo)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-md text-sm flex items-center gap-2 ${
                      active ? "bg-ink-900 text-bg" : "hover:bg-bg-subtle text-ink-800"
                    }`}>
                    <span className={`font-mono w-10 ${active ? "" : "text-ink-500"}`}>{it.itemNo}</span>
                    <span className="flex-1 truncate">{it.colorName}</span>
                    <span className={`text-[10px] ${active ? "text-bg/80" : "text-ink-400"}`}>{it.productType.slice(0, 4)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* BOM editor */}
        <div className="col-span-12 md:col-span-8 xl:col-span-9">
          {!selected ? (
            <div className="panel panel-pad text-sm text-ink-500">왼쪽에서 품목을 선택하세요.</div>
          ) : (
            <div className="space-y-4">
              <div className="panel panel-pad flex items-center justify-between">
                <div>
                  <div className="text-xs text-ink-500 uppercase tracking-wider">품목</div>
                  <div className="text-lg font-semibold text-ink-900">
                    <span className="font-mono">{selected.itemNo}번</span> · {selected.colorName}
                    <span className="text-ink-500 font-normal ml-2 text-sm">
                      ({selected.productType})
                    </span>
                  </div>
                  <div className="text-xs text-ink-500 mt-1">
                    재고 {formatNumber(selected.stock)} {selected.unit} · 안전재고 {formatNumber(selected.safetyStock)}
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Link href={`/items/${selected.itemNo}`} className="btn-ghost text-xs">추적 보기</Link>
                  <button className="btn-ghost" onClick={() => { setTplOpen((v) => !v); setTplResult(null); setTplError(null); }}
                    disabled={!canEditBom || templateNames.length === 0}
                    title={templateNames.length === 0 ? "먼저 BOM 템플릿을 등록하세요." : !canEditBom ? PERMISSION_TIP : undefined}
                  ><Copy size={14} /> 템플릿 적용</button>
                  <button className="btn-ghost"
                    onClick={() => { setSaveTplOpen((v) => !v); setSaveTplCount(null); setSaveTplError(null); }}
                    disabled={!canEditBom || lines.length === 0}
                    title={lines.length === 0 ? "BOM이 비어 있습니다." : !canEditBom ? PERMISSION_TIP : undefined}
                  ><BookmarkPlus size={14} /> 현재 BOM을 템플릿으로 저장</button>
                  <button className="btn-primary" onClick={addLine}
                    disabled={!canEditBom} title={!canEditBom ? PERMISSION_TIP : undefined}
                  ><Plus size={14} /> 원료 추가</button>
                </div>
              </div>

              {saveTplOpen && (
                <div className="panel panel-pad space-y-3">
                  <div className="text-sm font-semibold">
                    현재 BOM을 템플릿으로 저장 — {selected.itemNo}번 ({lines.length}개 자재)
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
                    <div>
                      <label className="label">새 템플릿 이름</label>
                      <input className="input" value={saveTplName}
                        placeholder={`예: ${selected.productType} ${selected.colorName} 베이스`}
                        onChange={(e) => setSaveTplName(e.target.value)} />
                    </div>
                    <div className="flex gap-2">
                      <button className="btn-ghost" onClick={() => setSaveTplOpen(false)}>닫기</button>
                      <button className="btn-primary"
                        onClick={saveBomAsTemplate}
                        disabled={saveTplBusy || !saveTplName.trim() || !canEditBom || lines.length === 0}>
                        저장
                      </button>
                    </div>
                  </div>
                  <div className="text-xs text-ink-500">
                    빈 자재 행은 자동으로 제외됩니다. 기존 품목BOM은 변경되지 않습니다.
                  </div>
                  {saveTplCount !== null && (
                    <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded p-2">
                      {saveTplCount}개 자재가 템플릿으로 저장되었습니다.
                    </div>
                  )}
                  {saveTplError && (
                    <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">{saveTplError}</div>
                  )}
                </div>
              )}

              {tplOpen && (
                <div className="panel panel-pad space-y-3">
                  <div className="text-sm font-semibold">BOM 템플릿 적용 — {selected.itemNo}번</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="label">템플릿 이름</label>
                      <select className="input" value={tplName} onChange={(e) => setTplName(e.target.value)}>
                        {templateNames.length === 0 && <option value="">(템플릿 없음)</option>}
                        {templateNames.map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="label">적용 방식</label>
                      <div className="flex gap-3 text-sm pt-1">
                        <label className="flex items-center gap-1">
                          <input type="radio" name="tplMode" value="append"
                            checked={tplMode === "append"} onChange={() => setTplMode("append")} />
                          기존 BOM 유지하고 추가
                        </label>
                        <label className="flex items-center gap-1">
                          <input type="radio" name="tplMode" value="overwrite"
                            checked={tplMode === "overwrite"} onChange={() => setTplMode("overwrite")} />
                          기존 BOM 삭제 후 적용
                        </label>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <button className="btn-ghost" onClick={() => setTplOpen(false)}>닫기</button>
                    <button className="btn-primary" onClick={applyTemplate}
                      disabled={tplApplying || !tplName || !canEditBom}>
                      적용
                    </button>
                  </div>
                  {tplResult && (
                    <div className="text-xs text-ink-700 bg-bg-subtle border border-border rounded p-2">
                      <div>적용 모드: <b>{tplResult.effectiveMode}</b></div>
                      <div>추가된 원료 {tplResult.created}건 · 중복으로 건너뜀 {tplResult.skipped}건</div>
                      {tplResult.warning && <div className="text-amber-700 mt-1">{tplResult.warning}</div>}
                    </div>
                  )}
                  {tplError && (
                    <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">{tplError}</div>
                  )}
                </div>
              )}

              <SaveErrorPanel error={saveError} onClose={clearError}
                onRetry={() => retry()} retrying={saving} />

              <Table>
                <THead>
                  <TR>
                    <TH>원료</TH><TH>분류</TH>
                    <TH className="text-right">단위당사용량</TH><TH>단위</TH>
                    <TH>비고</TH><TH></TH>
                  </TR>
                </THead>
                <TBody>
                  {lines.length === 0 ? <Empty>BOM 라인이 없습니다.</Empty> :
                    lines.map((l, lineIdx) => {
                      // Resolve which material this row currently references —
                      // for the controlled select's `value`. Falls back through
                      // materialId → materialCode → materialName so existing
                      // rows still highlight the correct option even when one
                      // of the identifiers is empty in the sheet.
                      const currentMat = findMaterialForLine(l);
                      const selectValue = currentMat ? materialKey(currentMat) : "";
                      return (
                      <TR key={l.id || `__row-${lineIdx}`}>
                        <TD className="min-w-[260px]">
                          <select className="input"
                            value={selectValue}
                            onChange={(e) => {
                              const v = e.target.value;
                              if (!v) {
                                updateLine(l, { materialId: "", materialCode: "", materialName: "", materialCategory: "기타", unit: "" });
                                return;
                              }
                              // Match by the same key we use for the option value.
                              const m = materials.find((x, i) => materialKey(x, i) === v);
                              if (!m) return;
                              updateLine(l, {
                                materialId: materialKey(m),
                                materialCode: m.materialCode || m.id || materialKey(m),
                                materialName: m.materialName || m.name,
                                materialCategory: m.category,
                                // Use the production-side usage unit, not the
                                // purchase unit. kg → g, L → ml; others pass
                                // through. Existing BOM rows aren't touched.
                                unit: usageUnitFor(m),
                              });
                            }}>
                            <option value="">— 원료 선택 —</option>
                            <optgroup label="업사이클 원료재고">
                              {materials.map((m, i) => (m.source !== "기존") && (
                                <option key={materialKey(m, i)} value={materialKey(m, i)}>{materialLabel(m)}</option>
                              ))}
                            </optgroup>
                            <optgroup label="기존 원료재고">
                              {materials.map((m, i) => (m.source === "기존") && (
                                <option key={materialKey(m, i)} value={materialKey(m, i)}>{materialLabel(m)}</option>
                              ))}
                            </optgroup>
                          </select>
                        </TD>
                        <TD>
                          <span className="text-xs px-1.5 py-0.5 rounded bg-bg-subtle text-ink-700 border border-border">
                            {l.materialCategory}
                          </span>
                        </TD>
                        <TD className="text-right">
                          <input className="input text-right" type="number" step="0.01"
                            value={l.amountPerUnit}
                            onChange={(e) => updateLine(l, { amountPerUnit: Number(e.target.value) })}
                            onBlur={() => persistLine(l)} />
                        </TD>
                        <TD>
                          <div>{l.unit}</div>
                          {(() => {
                            const warn = unitConsistencyWarning(l.materialCategory, l.unit);
                            return warn ? (
                              <div className="text-[10px] text-amber-700 mt-0.5" title={warn}>⚠ {warn}</div>
                            ) : null;
                          })()}
                        </TD>
                        <TD>
                          <input className="input" value={l.note}
                            onChange={(e) => updateLine(l, { note: e.target.value })}
                            onBlur={() => persistLine(l)} />
                        </TD>
                        <TD className="text-right">
                          <button onClick={() => persistLine(l)}
                            disabled={!canEditBom}
                            className="text-ink-500 hover:text-emerald-700 mr-1 disabled:opacity-40 disabled:cursor-not-allowed"
                            title={canEditBom ? "저장" : PERMISSION_TIP}
                          ><Save size={14} /></button>
                          <button onClick={() => removeLine(l)}
                            disabled={!canDelete}
                            className="text-ink-500 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
                            title={canDelete ? "삭제" : PERMISSION_TIP}
                          ><Trash2 size={14} /></button>
                        </TD>
                      </TR>
                    );})
                  }
                </TBody>
              </Table>

              {lines.length > 0 && (
                <div className="panel panel-pad">
                  <div className="text-sm font-semibold mb-2">분류별 합계 (1{selected.unit}당)</div>
                  <div className="flex flex-wrap gap-2">
                    {totalsByCategory.map(([cat, total]) => (
                      <div key={cat} className="text-xs px-2 py-1 rounded border border-border bg-bg-subtle">
                        <span className="text-ink-500">{cat}</span>{" "}
                        <span className="font-semibold text-ink-900 tabular-nums">{formatNumber(total)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

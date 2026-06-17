"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Save, Search } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Table, THead, TBody, TR, TH, TD, Empty } from "@/components/Table";
import type { Fragrance, FragranceBomLine, Material, MaterialCategory } from "@/types";
import { formatNumber, formatCurrency } from "@/lib/utils";
import { useCanEdit, PERMISSION_TIP } from "@/components/useRole";
import { usageUnitFor, unitConsistencyWarning } from "@/lib/units";
import { categoryBadgeClass } from "@/lib/categoryColor";
import { useResourceSave } from "@/hooks/useResourceSave";
import SaveErrorPanel from "@/components/SaveErrorPanel";

export default function FragranceBomClient({
  initialBom, fragrances, materials,
}: {
  initialBom: FragranceBomLine[];
  fragrances: Fragrance[];
  materials: Material[];
}) {
  const router = useRouter();
  const [bom, setBom] = useState<FragranceBomLine[]>(initialBom);
  const [selectedCode, setSelectedCode] = useState<string>(fragrances[0]?.fragranceCode ?? "");
  const [q, setQ] = useState("");
  const canEdit = useCanEdit("bom");
  const canDelete = useCanEdit("delete");
  const { save, error: saveError, clearError, saving } = useResourceSave("/api/fragrance-bom");

  const visibleFragrances = useMemo(() =>
    fragrances.filter((f) => !q || `${f.fragranceCode} ${f.fragranceName}`.toLowerCase().includes(q.toLowerCase())),
  [fragrances, q]);

  const selected = fragrances.find((f) => f.fragranceCode === selectedCode);
  const lines = bom.filter((b) => b.fragranceCode === selectedCode);

  function materialKey(m: Material, i?: number): string {
    return m.materialCode || m.id || (i != null ? `__idx-${i}` : "");
  }
  function materialLabel(m: Material): string {
    const name = m.materialName || m.name || "(이름 없음)";
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
    return `[${m.category}] ${name}${code}${unitInfo}${priceInfo}`;
  }

  async function refetchBom() {
    try {
      const j = await (await fetch("/api/fragrance-bom", { cache: "no-store" })).json();
      if (Array.isArray(j.data)) setBom(j.data);
    } catch { /* ignore */ }
  }

  async function addLine() {
    if (!selected) return;
    const res = await save<FragranceBomLine>("POST", {
      fragranceCode: selected.fragranceCode,
      materialCode: "",
      materialName: "",
      category: "기타" as MaterialCategory,
      qty: 0,
      unit: "",
      note: "",
    });
    if (!res.ok) return;
    // Optimistic — append the server-confirmed new line immediately.
    if (res.data && res.data.id) {
      setBom((prev) => [...prev, res.data]);
    }
    // Background refetch so the bom list reflects server canonical state.
    refetchBom();
    router.refresh();
  }

  function updateLine(b: FragranceBomLine, patch: Partial<FragranceBomLine>) {
    setBom((prev) => prev.map((x) => (x.id === b.id ? { ...x, ...patch } : x)));
  }

  async function persistLine(b: FragranceBomLine) {
    const snapshot = bom;
    const res = await save("POST", b);
    if (!res.ok) setBom(snapshot);
  }

  async function removeLine(b: FragranceBomLine) {
    if (!confirm("이 향BOM 라인을 삭제하시겠습니까?")) return;
    const snapshot = bom;
    setBom((p) => p.filter((x) => x.id !== b.id));
    const res = await save("DELETE", undefined, `id=${encodeURIComponent(b.id)}`);
    if (!res.ok) setBom(snapshot);
  }

  return (
    <div>
      <PageHeader
        title="향 BOM"
        description="향(fragrance) 별 배합비. 향 생산 시 이 BOM을 기반으로 원료가 차감됩니다."
      />

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 md:col-span-4 xl:col-span-3">
          <div className="panel">
            <div className="px-3 py-2 border-b border-border">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400" />
                <input className="input pl-8" placeholder="향 검색"
                  value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-2 space-y-1">
              {visibleFragrances.length === 0
                ? <div className="text-sm text-ink-500 p-3 text-center">결과 없음</div>
                : visibleFragrances.map((f) => {
                    const active = f.fragranceCode === selectedCode;
                    return (
                      <button key={f.id}
                        onClick={() => setSelectedCode(f.fragranceCode)}
                        className={`w-full text-left px-2.5 py-1.5 rounded-md text-sm flex items-center gap-2 ${
                          active ? "bg-ink-900 text-bg" : "hover:bg-bg-subtle text-ink-800"
                        }`}>
                        <span className={`font-mono w-16 truncate ${active ? "" : "text-ink-500"}`}>{f.fragranceCode}</span>
                        <span className="flex-1 truncate">{f.fragranceName}</span>
                      </button>
                    );
                  })
              }
            </div>
          </div>
        </div>

        <div className="col-span-12 md:col-span-8 xl:col-span-9">
          {!selected
            ? <div className="panel panel-pad text-sm text-ink-500">왼쪽에서 향을 선택하세요.</div>
            : (
              <div className="space-y-4">
                <div className="panel panel-pad flex items-center justify-between">
                  <div>
                    <div className="text-xs text-ink-500 uppercase tracking-wider">향</div>
                    <div className="text-lg font-semibold text-ink-900">
                      <span className="font-mono">{selected.fragranceCode}</span> · {selected.fragranceName}
                      <span className="text-ink-500 font-normal ml-2 text-sm">
                        ({selected.productType} · {selected.fragranceType})
                      </span>
                    </div>
                  </div>
                  <button className="btn-primary" onClick={addLine}
                    disabled={!canEdit || saving} title={!canEdit ? PERMISSION_TIP : undefined}>
                    <Plus size={14} /> 원료 추가
                  </button>
                </div>

                <SaveErrorPanel error={saveError} onClose={clearError} />

                <Table>
                  <THead>
                    <TR>
                      <TH>원료</TH><TH>분류</TH>
                      <TH className="text-right">qty</TH><TH>단위</TH>
                      <TH>비고</TH><TH></TH>
                    </TR>
                  </THead>
                  <TBody>
                    {lines.length === 0 ? <Empty>BOM 라인이 없습니다.</Empty> :
                      lines.map((l) => {
                        const current = materials.find(
                          (x) =>
                            (l.materialCode && (x.materialCode === l.materialCode || x.id === l.materialCode)) ||
                            (l.materialName && (x.materialName || x.name) === l.materialName),
                        );
                        const selValue = current ? materialKey(current) : "";
                        return (
                          <TR key={l.id}>
                            <TD className="min-w-[260px]">
                              <select className="input" value={selValue}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  if (!v) {
                                    updateLine(l, { materialCode: "", materialName: "", category: "기타", unit: "" });
                                    return;
                                  }
                                  const m = materials.find((x, i) => materialKey(x, i) === v);
                                  if (!m) return;
                                  updateLine(l, {
                                    materialCode: m.materialCode || m.id || materialKey(m),
                                    materialName: m.materialName || m.name,
                                    category: m.category,
                                    // Normalized production-side usage unit
                                    // (kg → g, L → ml). Existing rows aren't
                                    // touched until the user reselects.
                                    unit: usageUnitFor(m),
                                  });
                                }}
                                onBlur={() => persistLine(l)}>
                                <option value="">— 원료 선택 —</option>
                                {materials.map((m, i) => {
                                  const k = materialKey(m, i);
                                  return <option key={k} value={k}>{materialLabel(m)}</option>;
                                })}
                              </select>
                            </TD>
                            <TD>
                              <span className={`inline-block whitespace-nowrap text-xs px-1.5 py-0.5 rounded border ${categoryBadgeClass(l.category)}`}>{l.category}</span>
                            </TD>
                            <TD className="text-right">
                              <input className="input text-right tabular-nums" type="number" step="0.01"
                                value={l.qty}
                                onChange={(e) => updateLine(l, { qty: Number(e.target.value) })}
                                onBlur={() => persistLine(l)} />
                            </TD>
                            <TD>
                              <div>{l.unit}</div>
                              {(() => {
                                const warn = unitConsistencyWarning(l.category, l.unit);
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
                              <button onClick={() => persistLine(l)} disabled={!canEdit}
                                className="text-ink-500 hover:text-emerald-700 mr-1 disabled:opacity-40 disabled:cursor-not-allowed"
                                title={canEdit ? "저장" : PERMISSION_TIP}>
                                <Save size={14} />
                              </button>
                              <button onClick={() => removeLine(l)} disabled={!canDelete}
                                className="text-ink-500 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
                                title={canDelete ? "삭제" : PERMISSION_TIP}>
                                <Trash2 size={14} />
                              </button>
                            </TD>
                          </TR>
                        );
                      })
                    }
                  </TBody>
                </Table>

                {lines.length > 0 && (
                  <div className="panel panel-pad">
                    <div className="text-sm font-semibold mb-1">총 배합량 (1회 기준)</div>
                    <div className="text-2xl font-semibold tabular-nums text-ink-900">
                      {formatNumber(lines.reduce((s, l) => s + l.qty, 0))} <span className="text-sm text-ink-500">ml</span>
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

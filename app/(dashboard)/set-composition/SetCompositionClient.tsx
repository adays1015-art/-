"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2, ChevronDown } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Table, THead, TBody, TR, TH, TD, Empty } from "@/components/Table";
import type { Item, Material, SetComposition, SetOption } from "@/types";
import { formatNumber } from "@/lib/utils";
import { useCanEdit, PERMISSION_TIP } from "@/components/useRole";
import { useResourceSave } from "@/hooks/useResourceSave";
import SaveErrorPanel from "@/components/SaveErrorPanel";

type Category = "item" | "material";

export default function SetCompositionClient({
  initialComposition, options, items, materials, initialOptionId,
}: {
  initialComposition: SetComposition[];
  options: SetOption[];
  items: Item[];
  materials: Material[];
  initialOptionId: string | null;
}) {
  const router = useRouter();
  const [comps, setComps] = useState<SetComposition[]>(initialComposition);
  const [optionId, setOptionId] = useState<string>(initialOptionId ?? options[0]?.id ?? "");
  const [category, setCategory] = useState<Category>("item");
  const [pickedItem, setPickedItem] = useState<Item | null>(null);
  const [pickedMaterial, setPickedMaterial] = useState<Material | null>(null);
  const [newQty, setNewQty] = useState<number>(1);
  const canEditSO = useCanEdit("set-options");
  const canDelete = useCanEdit("delete");
  const { save, saving, error: saveError, clearError } = useResourceSave("/api/set-composition");

  const opt = options.find((o) => o.id === optionId);
  const lines = useMemo(() =>
    comps.filter((c) => c.setOptionId === optionId).sort((a, b) => a.order - b.order),
  [comps, optionId]);

  async function refetchComps() {
    try {
      const j = await (await fetch("/api/set-composition")).json();
      if (Array.isArray(j.data)) setComps(j.data);
    } catch { /* ignore */ }
  }

  async function addLine() {
    if (!opt) return;
    const order = (lines.at(-1)?.order ?? 0) + 1;
    let body: Partial<SetComposition> & { setOptionId: string; order: number; qty: number };
    if (category === "item") {
      if (!pickedItem) return;
      body = {
        setOptionId: opt.id,
        itemNo: pickedItem.itemNo,
        order,
        qty: newQty,
        note: "",
        componentType: "item",
        componentCode: pickedItem.itemNo,
        componentName: pickedItem.colorName,
      };
    } else {
      if (!pickedMaterial) return;
      const code = pickedMaterial.materialCode || pickedMaterial.id;
      const name = pickedMaterial.materialName || pickedMaterial.name;
      body = {
        setOptionId: opt.id,
        itemNo: "",                    // 호환 — material 일 때 빈값
        order,
        qty: newQty,
        note: "",
        componentType: "material",
        componentCode: code,
        componentName: name,
      };
    }
    const res = await save("POST", body);
    if (!res.ok) return;
    await refetchComps();
    setPickedItem(null);
    setPickedMaterial(null);
    setNewQty(1);
    router.refresh();
  }

  async function removeLine(c: SetComposition) {
    if (!confirm("이 구성 라인을 삭제하시겠습니까?")) return;
    const res = await save("DELETE", undefined, `id=${encodeURIComponent(c.id)}`);
    if (!res.ok) return;
    await refetchComps();
    router.refresh();
  }

  // Resolve row → (item or material) for display & stock calc
  function resolveRow(l: SetComposition) {
    const type = l.componentType
      ?? (l.itemNo ? "item" : (l.componentCode ? "material" : "item"));
    if (type === "material") {
      const code = l.componentCode || l.itemNo;
      const m = materials.find((x) => (x.materialCode || x.id) === code);
      return {
        type: "material" as const,
        code,
        name: l.componentName || m?.materialName || m?.name || "",
        stock: m?.stock ?? 0,
        unit: m?.unit ?? "",
        category: m?.category ?? "—",
      };
    }
    const itemNo = l.componentCode || l.itemNo;
    const it = items.find((i) => i.itemNo === itemNo);
    return {
      type: "item" as const,
      code: itemNo,
      name: l.componentName || it?.colorName || "",
      stock: it?.stock ?? 0,
      unit: it?.unit ?? "",
      category: it?.productType ?? "—",
    };
  }

  // 조립 가능 재고 (현재고 / qty 의 최소값)
  const perLineMax = lines.map((l) => {
    const r = resolveRow(l);
    return { code: r.code, name: r.name, type: r.type, max: Math.floor(r.stock / (l.qty || 1)) };
  });
  const maxSets = perLineMax.length === 0 ? 0 : Math.min(...perLineMax.map((p) => p.max));
  const bottleneckLine = perLineMax.length === 0
    ? null
    : perLineMax.reduce((acc, p) => (p.max < acc.max ? p : acc), perLineMax[0]);

  return (
    <div>
      <PageHeader
        title="세트 구성"
        description="각 세트 옵션의 구성품을 정의합니다. 품목(완제품 색상) + 원료(원자재) 두 카테고리를 모두 지원합니다."
      />

      <div className="panel panel-pad mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="label">세트 옵션</label>
            <select className="input w-80" value={optionId} onChange={(e) => setOptionId(e.target.value)}>
              {options.map((o) => (
                <option key={o.id} value={o.id}>[{o.productType}] {o.setSize} · {o.optionName} ({o.optionCode})</option>
              ))}
            </select>
          </div>
          {opt && (
            <div className="ml-auto text-right">
              <div className="text-xs text-ink-500 uppercase tracking-wider"
                title="가장 부족한 구성품 재고 기준으로 계산됩니다.">
                현재 조합 가능 재고
              </div>
              <div className={`text-xl font-semibold tabular-nums ${maxSets === 0 ? "text-red-700" : "text-ink-900"}`}>
                {formatNumber(maxSets)} 세트
              </div>
              <div className="text-[10px] text-ink-500 mt-0.5">가장 부족한 구성품 기준 계산</div>
              {bottleneckLine && lines.length > 1 && (
                <div className="text-[10px] text-amber-700 mt-0.5">
                  병목 구성품: <span className="font-mono">{bottleneckLine.code}</span>
                  {bottleneckLine.name && <> · {bottleneckLine.name}</>}
                  <span className="ml-1 text-ink-500">({bottleneckLine.type === "item" ? "제품" : "원료"})</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {!opt ? <div className="panel panel-pad text-sm text-ink-500">세트 옵션을 먼저 등록하세요.</div> : (
        <>
          <Table>
            <THead>
              <TR>
                <TH className="text-right">순서</TH>
                <TH>카테고리</TH>
                <TH>코드</TH>
                <TH>이름</TH>
                <TH>분류</TH>
                <TH className="text-right">세트당 수량</TH>
                <TH className="text-right">현재고</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {lines.length === 0 ? <Empty>이 옵션에 등록된 구성품이 없습니다.</Empty> :
                lines.map((l) => {
                  const r = resolveRow(l);
                  const max = Math.floor(r.stock / (l.qty || 1));
                  const bottleneck = max === maxSets;
                  return (
                    <TR key={l.id} highlight={bottleneck && max < 10}>
                      <TD className="text-right tabular-nums">{l.order}</TD>
                      <TD>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                          r.type === "item"
                            ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                            : "bg-amber-50 text-amber-800 border-amber-200"
                        }`}>{r.type === "item" ? "제품" : "원료"}</span>
                      </TD>
                      <TD>
                        {r.type === "item" ? (
                          <Link href={`/items/${r.code}`} className="font-mono font-semibold text-ink-900 hover:underline">{r.code}</Link>
                        ) : (
                          <span className="font-mono text-xs">{r.code}</span>
                        )}
                      </TD>
                      <TD>{r.name || "—"}</TD>
                      <TD className="text-ink-700">{r.category}</TD>
                      <TD className="text-right tabular-nums">×{l.qty}</TD>
                      <TD className="text-right tabular-nums">{formatNumber(r.stock)} {r.unit}</TD>
                      <TD className="text-right">
                        <button onClick={() => removeLine(l)}
                          disabled={!canDelete || saving}
                          className="text-ink-500 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
                          title={canDelete ? "삭제" : PERMISSION_TIP}
                        ><Trash2 size={14} /></button>
                      </TD>
                    </TR>
                  );
                })
              }
            </TBody>
          </Table>

          <div className="panel panel-pad mt-4">
            <div className="text-sm font-semibold mb-2">구성품 추가</div>
            <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_auto_auto] gap-3 items-end">
              <div className="w-32">
                <label className="label">카테고리</label>
                <select className="input"
                  value={category}
                  onChange={(e) => {
                    const v = e.target.value as Category;
                    setCategory(v);
                    setPickedItem(null);
                    setPickedMaterial(null);
                  }}>
                  <option value="item">제품</option>
                  <option value="material">원료</option>
                </select>
              </div>

              <div>
                <label className="label">구성품 선택</label>
                {category === "item" ? (
                  <SearchableSelect
                    options={items.filter((i) => i.status === "사용중").sort((a, b) => Number(a.itemNo) - Number(b.itemNo))}
                    value={pickedItem?.itemNo ?? ""}
                    onChange={(_k, it) => setPickedItem(it)}
                    getOptionKey={(it) => it.itemNo}
                    getOptionLabel={(it) => (
                      <span className="flex items-center gap-3 w-full">
                        <span className="font-mono text-ink-500 w-12 shrink-0">{it.itemNo}</span>
                        <span className="flex-1 truncate">{it.colorName}</span>
                        <span className="text-[10px] text-ink-500">{it.productType}</span>
                      </span>
                    )}
                    filterFn={(it, q) =>
                      (it.itemNo ?? "").toLowerCase().includes(q) ||
                      (it.colorName ?? "").toLowerCase().includes(q) ||
                      (it.productType ?? "").toLowerCase().includes(q)
                    }
                    placeholder="품목번호 / 품목명 검색"
                  />
                ) : (
                  <SearchableSelect
                    options={materials}
                    value={pickedMaterial ? (pickedMaterial.materialCode || pickedMaterial.id) : ""}
                    onChange={(_k, m) => setPickedMaterial(m)}
                    getOptionKey={(m) => m.materialCode || m.id}
                    getOptionLabel={(m) => {
                      const name = m.materialName || m.name;
                      const code = m.materialCode || m.id;
                      return (
                        <span className="flex items-center gap-3 w-full">
                          <span className="font-mono text-ink-500 w-24 shrink-0 truncate">{code}</span>
                          <span className="flex-1 truncate">
                            <span className="font-medium">{name}</span>
                            <span className="text-[10px] text-ink-500 ml-1">({m.category})</span>
                          </span>
                          <span className="text-[10px] text-ink-500 shrink-0">
                            {formatNumber(m.stock)} {m.unit}
                          </span>
                        </span>
                      );
                    }}
                    filterFn={(m, q) => {
                      const code = (m.materialCode || m.id || "").toLowerCase();
                      const name = (m.materialName || m.name || "").toLowerCase();
                      return code.includes(q) || name.includes(q);
                    }}
                    placeholder="원료번호 / 원료명 검색"
                  />
                )}
              </div>

              <div className="w-28">
                <label className="label">세트당 수량</label>
                <input className="input text-right tabular-nums" type="number" min={1} value={newQty}
                  onChange={(e) => setNewQty(Number(e.target.value) || 1)} />
              </div>

              <button className="btn-primary" onClick={addLine}
                disabled={!canEditSO || saving || (category === "item" ? !pickedItem : !pickedMaterial)}
                title={!canEditSO ? PERMISSION_TIP : undefined}
              ><Plus size={14} /> 추가</button>
            </div>
            <div className="mt-3">
              <SaveErrorPanel error={saveError} onClose={clearError} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── SearchableSelect (검색 가능한 scroll dropdown) ─────────
function SearchableSelect<T>({
  options, value, onChange,
  getOptionKey, getOptionLabel, filterFn,
  placeholder = "선택하세요",
  searchPlaceholder = "검색...",
  emptyMessage = "검색 결과 없음",
  maxHeight = "max-h-80",
  disabled = false,
}: {
  options: T[];
  value: string;
  onChange: (key: string, option: T | null) => void;
  getOptionKey: (o: T) => string;
  getOptionLabel: (o: T) => React.ReactNode;
  filterFn?: (o: T, query: string) => boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  maxHeight?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = !q
      ? options
      : (filterFn ? options.filter((o) => filterFn(o, q)) : options);
    // Cap visible options at 100 to avoid rendering huge DOM trees.
    return base.slice(0, 100);
  }, [options, query, filterFn]);
  const overflowed = !query.trim() && options.length > 100;

  const selected = options.find((o) => getOptionKey(o) === value) ?? null;

  return (
    <div ref={ref} className="relative">
      <button type="button" disabled={disabled}
        className="input w-full text-left flex items-center justify-between"
        onClick={() => !disabled && setOpen((v) => !v)}>
        <span className={selected ? "" : "text-ink-400"}>
          {selected ? getOptionLabel(selected) : placeholder}
        </span>
        <ChevronDown size={14} className="text-ink-400 shrink-0 ml-2" />
      </button>
      {open && (
        <div className="absolute z-20 mt-1 left-0 right-0 border border-border rounded-md bg-white shadow-lg overflow-hidden">
          <div className="p-2 border-b border-border bg-bg-subtle/40">
            <input className="input h-8 w-full" autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder} />
          </div>
          <div className={`${maxHeight} overflow-y-auto`}>
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-xs text-ink-500 text-center">{emptyMessage}</div>
            ) : (<>
              {filtered.map((o) => {
                const key = getOptionKey(o);
                const isActive = key === value;
                return (
                  <button key={key} type="button"
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-bg-subtle border-b border-border last:border-b-0 ${
                      isActive ? "bg-emerald-50" : ""
                    }`}
                    onClick={() => {
                      onChange(key, o);
                      setQuery("");
                      setOpen(false);
                    }}>
                    {getOptionLabel(o)}
                  </button>
                );
              })}
              {overflowed && (
                <div className="px-3 py-2 text-[10px] text-ink-500 text-center border-t border-border bg-bg-subtle/40">
                  상위 100건만 표시 · 검색어로 좁혀주세요
                </div>
              )}
            </>)}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Table, THead, TBody, TR, TH, TD, Empty } from "@/components/Table";
import { useResourceSave } from "@/hooks/useResourceSave";
import SaveErrorPanel from "@/components/SaveErrorPanel";
import type { Material, SetBomLine, SetOption } from "@/types";

export default function SetBomClient({
  setBom: initialSetBom, setOptions, materials,
}: {
  setBom: SetBomLine[];
  setOptions: SetOption[];
  materials: Material[];
}) {
  const router = useRouter();
  const [setBom, setSetBom] = useState<SetBomLine[]>(initialSetBom);
  useEffect(() => { setSetBom(initialSetBom); }, [initialSetBom]);
  const { save, saving, error, clearError, retry } = useResourceSave("/api/set-bom");

  // ─── 세트옵션 picker (상단 dropdown) ─────────────────────
  const activeOptions = useMemo(
    () => setOptions
      .filter((o) => o.optionCode && o.optionName)
      .sort((a, b) => a.optionCode.localeCompare(b.optionCode)),
    [setOptions],
  );
  const [selectedOptionCode, setSelectedOptionCode] = useState<string>(
    activeOptions[0]?.optionCode ?? "",
  );
  const selected = setOptions.find((o) => o.optionCode === selectedOptionCode);

  // ─── 선택 옵션의 BOM 라인 ───────────────────────────────
  const lines = useMemo(
    () => setBom.filter((b) => b.setCode === selectedOptionCode),
    [setBom, selectedOptionCode],
  );

  // ─── 원료 선택 헬퍼 (분류 표시용) ──────────────────────
  function materialKey(m: Material): string {
    return m.materialCode || m.id;
  }
  function materialLabel(m: Material): string {
    const name = m.materialName || m.name;
    const code = m.materialCode || m.id;
    return `${name} (${code})`;
  }

  // ─── BOM CRUD — 단가는 저장/표시하지 않음 ──────────────
  async function addLine() {
    if (!selected) return;
    const res = await save<SetBomLine>("POST", {
      action: "create",
      line: {
        setCode: selected.optionCode,
        setName: selected.optionName,
        componentType: "material",
        componentCode: "",
        componentName: "",
        qty: 1,
        unitCost: 0,
        unitCostSource: "",
        note: "",
      },
    });
    if (!res.ok) return;
    if (res.data) setSetBom((arr) => [...arr, res.data!]);
    router.refresh();
  }

  function localUpdate(line: SetBomLine, patch: Partial<SetBomLine>) {
    setSetBom((arr) => arr.map((b) => (b.id === line.id ? { ...b, ...patch } : b)));
  }
  async function persistLine(line: SetBomLine, patch: Partial<SetBomLine>) {
    const res = await save<SetBomLine>("POST", {
      action: "update",
      id: line.id,
      patch,
    });
    if (!res.ok) return;
    if (res.data) {
      const upd = res.data;
      setSetBom((arr) => arr.map((b) => (b.id === line.id ? upd : b)));
    }
    router.refresh();
  }
  async function removeLine(line: SetBomLine) {
    if (!confirm("이 BOM 라인을 삭제하시겠습니까?")) return;
    const res = await save("POST", { action: "delete", id: line.id });
    if (!res.ok) return;
    setSetBom((arr) => arr.filter((b) => b.id !== line.id));
    router.refresh();
  }

  function onPickMaterial(line: SetBomLine, key: string) {
    if (!key) {
      persistLine(line, { componentCode: "", componentName: "" });
      return;
    }
    const m = materials.find((x) => materialKey(x) === key);
    if (!m) return;
    // 단가는 저장하지 않음 — componentCode + componentName 만 갱신.
    persistLine(line, {
      componentCode: materialKey(m),
      componentName: m.materialName || m.name,
    });
  }

  return (
    <div>
      <PageHeader
        title="세트 BOM"
        description="세트옵션별 구성품 관리. 판매가·수수료·마진은 세트옵션 / 원가계산에서 다룹니다."
      />

      {/* ─── 상단: 세트옵션 선택 ─── */}
      <div className="panel mb-4">
        <div className="px-4 py-3 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3 items-end">
          <div>
            <label className="label">세트옵션 선택</label>
            <select className="input"
              value={selectedOptionCode}
              onChange={(e) => setSelectedOptionCode(e.target.value)}>
              {activeOptions.length === 0 ? (
                <option value="">(등록된 세트옵션 없음 — 세트옵션 페이지에서 등록)</option>
              ) : (
                activeOptions.map((o) => (
                  <option key={o.id} value={o.optionCode}>
                    [{o.optionCode}] {o.optionName} · {o.productType} {o.setSize}
                  </option>
                ))
              )}
            </select>
          </div>
          {selected && (
            <button className="btn-primary" onClick={addLine} disabled={saving}>
              <Plus size={14} /> 구성품 추가
            </button>
          )}
        </div>
      </div>

      <SaveErrorPanel error={error} onClose={clearError}
        onRetry={() => retry()} retrying={saving} />

      {/* ─── 하단: 구성 목록 ─── */}
      {selected && (
        <Table>
          <THead>
            <TR>
              <TH>구성명</TH>
              <TH>분류</TH>
              <TH className="text-right">수량</TH>
              <TH>비고</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {lines.length === 0 ? <Empty>BOM 라인이 없습니다.</Empty> :
              lines.map((l) => {
                const currentMat = materials.find((m) => materialKey(m) === l.componentCode);
                return (
                  <TR key={l.id}>
                    <TD className="min-w-[260px]">
                      <select className="input"
                        value={l.componentCode}
                        onChange={(e) => onPickMaterial(l, e.target.value)}>
                        <option value="">— 구성품 선택 —</option>
                        {materials.map((m) => {
                          const k = materialKey(m);
                          return <option key={k} value={k}>{materialLabel(m)}</option>;
                        })}
                      </select>
                    </TD>
                    <TD>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-bg-subtle text-ink-700 border border-border">
                        {currentMat?.category ?? "—"}
                      </span>
                    </TD>
                    <TD className="text-right">
                      <input className="input text-right tabular-nums w-20" type="number" min={0} step="0.01"
                        value={l.qty}
                        onChange={(e) => localUpdate(l, { qty: Number(e.target.value) || 0 })}
                        onBlur={() => persistLine(l, { qty: l.qty })} />
                    </TD>
                    <TD>
                      <input className="input" value={l.note}
                        onChange={(e) => localUpdate(l, { note: e.target.value })}
                        onBlur={() => persistLine(l, { note: l.note })} />
                    </TD>
                    <TD className="text-right">
                      <button className="btn-ghost text-xs text-red-600 hover:text-red-700"
                        onClick={() => removeLine(l)}>
                        <Trash2 size={12} /> 삭제
                      </button>
                    </TD>
                  </TR>
                );
              })
            }
          </TBody>
        </Table>
      )}
    </div>
  );
}

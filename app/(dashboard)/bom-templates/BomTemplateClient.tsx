"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, Save, Copy } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Table, THead, TBody, TR, TH, TD, Empty } from "@/components/Table";
import type { BomTemplateLine, Material, MaterialCategory, ProductType } from "@/types";
import { PRODUCT_TYPES } from "@/types";
import { useCanEdit, PERMISSION_TIP } from "@/components/useRole";
import { useResourceSave } from "@/hooks/useResourceSave";
import SaveErrorPanel from "@/components/SaveErrorPanel";
import { categoryBadgeClass } from "@/lib/categoryColor";

const DEFAULT_SUGGESTIONS = [
  "오일파스텔 기본 베이스",
  "수채물감 기본 베이스",
  "고체물감 기본 베이스",
];

export default function BomTemplateClient({
  initialLines, materials,
}: {
  initialLines: BomTemplateLine[];
  materials: Material[];
}) {
  const [lines, setLines] = useState<BomTemplateLine[]>(initialLines);
  const canEdit = useCanEdit("bom");
  const canDelete = useCanEdit("delete");
  const { save, saving, error: saveError, clearError, retry } = useResourceSave("/api/bom-template");

  // Pre-existing template names + default suggestions
  const knownNames = useMemo(() => {
    const set = new Set<string>(DEFAULT_SUGGESTIONS);
    for (const l of lines) if (l.templateName) set.add(l.templateName);
    return Array.from(set);
  }, [lines]);

  const [selectedName, setSelectedName] = useState<string>(
    initialLines[0]?.templateName ?? DEFAULT_SUGGESTIONS[0],
  );
  const [newTemplateName, setNewTemplateName] = useState<string>("");
  const [duplicateNewName, setDuplicateNewName] = useState<string>("");

  const linesOfTemplate = useMemo(
    () => lines.filter((l) => l.templateName === selectedName),
    [lines, selectedName],
  );

  async function refetch() {
    try {
      const j = await (await fetch("/api/bom-template")).json();
      if (Array.isArray(j.data)) setLines(j.data);
    } catch { /* ignore */ }
  }

  function materialKey(m: Material, idx?: number): string {
    return m.id || m.materialCode || m.materialName || m.name || (idx != null ? `__idx-${idx}` : "");
  }
  function materialLabel(m: Material): string {
    const name = m.materialName || m.name || m.id || "(이름 없음)";
    const code = m.materialCode && m.materialCode !== m.id ? ` · ${m.materialCode}` : "";
    return `[${m.category}] ${name}${code}`;
  }

  async function addLine() {
    if (!selectedName) return;
    const tempId = `__tmp-${Date.now()}`;
    const placeholder: BomTemplateLine = {
      id: tempId,
      templateName: selectedName,
      productType: "",
      materialCode: "",
      materialName: "",
      category: "기타",
      qty: 0,
      unit: "",
      note: "",
    };
    setLines((p) => [...p, placeholder]);
    const res = await save<BomTemplateLine>("POST", {
      templateName: selectedName,
      productType: "",
      materialCode: "",
      materialName: "",
      category: "기타",
      qty: 0,
      unit: "",
      note: "",
    });
    if (!res.ok) {
      setLines((p) => p.filter((l) => l.id !== tempId));
      return;
    }
    if (res.data?.id) {
      setLines((p) => p.map((l) => (l.id === tempId ? res.data as BomTemplateLine : l)));
    } else {
      await refetch();
    }
  }

  async function createTemplate() {
    const name = newTemplateName.trim();
    if (!name) return;
    const tempId = `__tmp-${Date.now()}`;
    const placeholder: BomTemplateLine = {
      id: tempId,
      templateName: name,
      productType: "",
      materialCode: "",
      materialName: "",
      category: "기타",
      qty: 0,
      unit: "",
      note: "초기 행 — 자재를 선택하세요",
    };
    setLines((p) => [...p, placeholder]);
    setNewTemplateName("");
    setSelectedName(name);
    const res = await save<BomTemplateLine>("POST", {
      templateName: name,
      productType: "",
      materialCode: "",
      materialName: "",
      category: "기타",
      qty: 0,
      unit: "",
      note: "초기 행 — 자재를 선택하세요",
    });
    if (!res.ok) {
      setLines((p) => p.filter((l) => l.id !== tempId));
      return;
    }
    if (res.data?.id) {
      setLines((p) => p.map((l) => (l.id === tempId ? res.data as BomTemplateLine : l)));
    }
  }

  async function duplicateTemplate() {
    const target = duplicateNewName.trim();
    if (!selectedName || !target || target === selectedName) return;
    const res = await save<BomTemplateLine[]>("POST", {
      action: "duplicate",
      sourceName: selectedName,
      newName: target,
    });
    if (!res.ok) return;
    setDuplicateNewName("");
    setSelectedName(target);
    // Merge the freshly-cloned lines straight into local state.
    if (Array.isArray(res.data) && res.data.length > 0) {
      setLines((p) => {
        const existingIds = new Set(p.map((l) => l.id));
        return [...p, ...(res.data as BomTemplateLine[]).filter((l) => !existingIds.has(l.id))];
      });
    } else {
      await refetch();
    }
  }

  function patchLine(l: BomTemplateLine, patch: Partial<BomTemplateLine>) {
    const merged = { ...l, ...patch };
    setLines((p) => p.map((x) => (x.id === l.id ? merged : x)));
  }

  async function persistLine(l: BomTemplateLine) {
    const snapshot = lines;
    const res = await save("POST", l);
    if (!res.ok) setLines(snapshot);
  }

  async function removeLine(l: BomTemplateLine) {
    if (!confirm("이 라인을 삭제하시겠습니까?")) return;
    const snapshot = lines;
    setLines((p) => p.filter((x) => x.id !== l.id));
    const res = await save("DELETE", undefined, `id=${encodeURIComponent(l.id)}`);
    if (!res.ok) setLines(snapshot);
  }

  return (
    <div>
      <PageHeader
        title="BOM 템플릿"
        description="여러 품목이 공유하는 공통 베이스 자재(왁스/오일/바인더 등)를 묶어 두고 품목BOM에 일괄 적용합니다."
      />

      <SaveErrorPanel error={saveError} onClose={clearError}
        onRetry={() => retry()} retrying={saving} />

      {initialLines.length === 0 && (
        <div className="panel panel-pad mb-4 text-sm bg-amber-50 border border-amber-200 text-amber-900">
          <div className="font-semibold mb-1">아직 등록된 BOM 템플릿이 없습니다.</div>
          <ol className="list-decimal pl-5 space-y-0.5 text-xs text-amber-900/90">
            <li>왼쪽 <b>새 템플릿</b>에서 이름을 입력해 생성합니다 (예: <span className="font-mono">오일파스텔 기본 베이스</span>).</li>
            <li>오른쪽에서 <b>자재 추가</b>로 공통 베이스 원료를 채워 넣습니다.</li>
            <li>품목 BOM 페이지의 <b>템플릿 적용</b> 버튼으로 한 번에 복사할 수 있습니다.</li>
          </ol>
        </div>
      )}

      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-12 md:col-span-4">
          <div className="panel">
            <div className="px-3 py-2 border-b border-border text-sm font-semibold">템플릿</div>
            <div className="p-2 space-y-1 max-h-[60vh] overflow-y-auto">
              {knownNames.length === 0 && (
                <div className="text-sm text-ink-500 p-3 text-center">템플릿이 없습니다.</div>
              )}
              {knownNames.map((n) => {
                const active = n === selectedName;
                const count = lines.filter((l) => l.templateName === n).length;
                return (
                  <button key={n} onClick={() => setSelectedName(n)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-md text-sm flex items-center gap-2 ${
                      active ? "bg-ink-900 text-bg" : "hover:bg-bg-subtle text-ink-800"
                    }`}>
                    <span className="flex-1 truncate">{n}</span>
                    <span className={`text-[10px] ${active ? "text-bg/80" : "text-ink-400"}`}>
                      {count > 0 ? `${count}건` : "미등록"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="panel panel-pad mt-3 space-y-2">
            <div className="text-sm font-semibold">새 템플릿</div>
            <input className="input" placeholder="예: 오일파스텔 무향 베이스"
              value={newTemplateName} onChange={(e) => setNewTemplateName(e.target.value)} />
            <button className="btn-primary w-full" disabled={!canEdit || saving || !newTemplateName.trim()}
              onClick={createTemplate} title={!canEdit ? PERMISSION_TIP : undefined}>
              <Plus size={14} /> 생성
            </button>
          </div>

          <div className="panel panel-pad mt-3 space-y-2">
            <div className="text-sm font-semibold">현재 템플릿 복제</div>
            <input className="input" placeholder="복제본 이름"
              value={duplicateNewName} onChange={(e) => setDuplicateNewName(e.target.value)} />
            <button className="btn-ghost w-full" disabled={!canEdit || saving || !duplicateNewName.trim() || !selectedName}
              onClick={duplicateTemplate} title={!canEdit ? PERMISSION_TIP : undefined}>
              <Copy size={14} /> 복제
            </button>
          </div>
        </div>

        <div className="col-span-12 md:col-span-8">
          {!selectedName ? (
            <div className="panel panel-pad text-sm text-ink-500">왼쪽에서 템플릿을 선택하거나 생성하세요.</div>
          ) : (
            <div className="space-y-4">
              <div className="panel panel-pad flex items-center justify-between">
                <div>
                  <div className="text-xs text-ink-500 uppercase tracking-wider">템플릿</div>
                  <div className="text-lg font-semibold text-ink-900">{selectedName}</div>
                  <div className="text-xs text-ink-500 mt-1">{linesOfTemplate.length}개 자재 라인</div>
                </div>
                <button className="btn-primary" onClick={addLine}
                  disabled={!canEdit || saving} title={!canEdit ? PERMISSION_TIP : undefined}
                ><Plus size={14} /> 자재 추가</button>
              </div>

              <Table>
                <THead>
                  <TR>
                    <TH>제품유형</TH>
                    <TH>자재</TH>
                    <TH>분류</TH>
                    <TH className="text-right">수량</TH>
                    <TH>단위</TH>
                    <TH>비고</TH>
                    <TH></TH>
                  </TR>
                </THead>
                <TBody>
                  {linesOfTemplate.length === 0 ? <Empty>자재 라인이 없습니다.</Empty> :
                    linesOfTemplate.map((l, idx) => {
                      const currentMat = materials.find(
                        (m) =>
                          (l.materialCode && m.materialCode === l.materialCode) ||
                          (l.materialName && (m.materialName || m.name) === l.materialName),
                      );
                      const selectValue = currentMat ? materialKey(currentMat) : "";
                      return (
                        <TR key={l.id || `__row-${idx}`}>
                          <TD>
                            <select className="input"
                              value={l.productType}
                              onChange={(e) => patchLine(l, { productType: e.target.value as ProductType | "공통" | "" })}
                              onBlur={() => persistLine(l)}>
                              <option value="">(공통)</option>
                              {PRODUCT_TYPES.map((p) => <option key={p} value={p}>{p}</option>)}
                            </select>
                          </TD>
                          <TD className="min-w-[240px]">
                            <select className="input" value={selectValue}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (!v) {
                                  patchLine(l, { materialCode: "", materialName: "", category: "기타" as MaterialCategory, unit: "" });
                                  return;
                                }
                                const m = materials.find((x, i) => materialKey(x, i) === v);
                                if (!m) return;
                                patchLine(l, {
                                  materialCode: m.materialCode || m.id || materialKey(m),
                                  materialName: m.materialName || m.name,
                                  category: m.category,
                                  unit: m.unit,
                                });
                              }}
                              onBlur={() => persistLine(l)}>
                              <option value="">— 자재 선택 —</option>
                              {materials.map((m, i) => {
                                const k = materialKey(m, i);
                                return <option key={k} value={k}>{materialLabel(m)}</option>;
                              })}
                            </select>
                          </TD>
                          <TD>
                            <span className={`inline-block whitespace-nowrap text-xs px-1.5 py-0.5 rounded border ${categoryBadgeClass(l.category)}`}>
                              {l.category}
                            </span>
                          </TD>
                          <TD className="text-right">
                            <input className="input text-right" type="number" step="0.01"
                              value={l.qty}
                              onChange={(e) => patchLine(l, { qty: Number(e.target.value) })}
                              onBlur={() => persistLine(l)} />
                          </TD>
                          <TD>{l.unit}</TD>
                          <TD>
                            <input className="input" value={l.note}
                              onChange={(e) => patchLine(l, { note: e.target.value })}
                              onBlur={() => persistLine(l)} />
                          </TD>
                          <TD className="text-right">
                            <button onClick={() => persistLine(l)} disabled={!canEdit || saving}
                              className="text-ink-500 hover:text-emerald-700 mr-1 disabled:opacity-40 disabled:cursor-not-allowed"
                              title={canEdit ? "저장" : PERMISSION_TIP}>
                              <Save size={14} />
                            </button>
                            <button onClick={() => removeLine(l)} disabled={!canDelete || saving}
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

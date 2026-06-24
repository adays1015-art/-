"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Printer, Pencil, Trash2, Copy, X } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import Modal from "@/components/Modal";
import { Table, THead, TBody, TR, TH, TD } from "@/components/Table";
import type { BusinessDocument, DocumentLineItem, DocumentType, TaxMode } from "@/types";
import { DOCUMENT_TYPES, TAX_MODES } from "@/types";
import { computeTotals, lineAmount, recalcDocument } from "@/lib/documentMath";
import { printDocument } from "@/lib/printDocument";
import { todayISO } from "@/lib/utils";

const CURRENCIES = ["KRW", "USD", "EUR", "JPY"];

function fmtMoney(n: number, currency: string): string {
  const v = Math.round(Number(n) || 0).toLocaleString("en-US");
  if (currency === "KRW") return `₩${v}`;
  if (currency === "USD") return `$${v}`;
  return `${v} ${currency}`;
}

const STATUS_STYLE: Record<BusinessDocument["status"], string> = {
  작성중: "bg-amber-50 text-amber-700 border-amber-200",
  발행: "bg-emerald-50 text-emerald-700 border-emerald-200",
  취소: "bg-slate-100 text-slate-500 border-slate-200 line-through",
};
function StatusBadge({ status }: { status: BusinessDocument["status"] }) {
  return <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-md border ${STATUS_STYLE[status]}`}>{status}</span>;
}

const TYPE_STYLE: Record<DocumentType, string> = {
  견적서: "bg-blue-50 text-blue-700 border-blue-200",
  거래명세서: "bg-violet-50 text-violet-700 border-violet-200",
  인보이스: "bg-teal-50 text-teal-700 border-teal-200",
  발주서: "bg-orange-50 text-orange-700 border-orange-200",
};

type Draft = Omit<BusinessDocument, "id" | "createdAt" | "updatedAt" | "subtotal" | "tax" | "total">;

const emptyLine = (): DocumentLineItem => ({ name: "", spec: "", qty: 1, unit: "개", unitPrice: 0, amount: 0, note: "" });

function emptyDraft(type: DocumentType = "견적서"): Draft {
  return {
    docType: type, docNo: "", issueDate: todayISO(), status: "작성중",
    clientName: "", clientBizNo: "", clientContact: "", clientPhone: "", clientAddress: "",
    currency: "KRW", taxMode: "별도", taxRate: 10, items: [emptyLine()], note: "",
  };
}

const ICON_BTN = "p-1.5 rounded-md hover:bg-bg-subtle text-ink-600 transition-colors";

export default function DocumentsClient({
  initial, today,
}: { initial: BusinessDocument[]; today: string }) {
  const router = useRouter();
  const [docs, setDocs] = useState(initial);
  const [typeFilter, setTypeFilter] = useState<DocumentType | "전체">("전체");
  const [query, setQuery] = useState("");
  const [showCancelled, setShowCancelled] = useState(false);

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return docs.filter((d) => {
      if (!showCancelled && d.status === "취소") return false;
      if (typeFilter !== "전체" && d.docType !== typeFilter) return false;
      if (!q) return true;
      return d.docNo.toLowerCase().includes(q) || d.clientName.toLowerCase().includes(q) || d.note.toLowerCase().includes(q);
    });
  }, [docs, typeFilter, query, showCancelled]);

  function openNew() {
    setEditingId(null);
    setDraft(emptyDraft(typeFilter === "전체" ? "견적서" : typeFilter));
    setOpen(true);
  }
  function openEdit(d: BusinessDocument) {
    setEditingId(d.id);
    setDraft({
      docType: d.docType, docNo: d.docNo, issueDate: d.issueDate, status: d.status,
      clientName: d.clientName, clientBizNo: d.clientBizNo ?? "", clientContact: d.clientContact ?? "",
      clientPhone: d.clientPhone ?? "", clientAddress: d.clientAddress ?? "",
      currency: d.currency, taxMode: d.taxMode, taxRate: d.taxRate,
      items: d.items.length ? d.items.map((x) => ({ ...x })) : [emptyLine()], note: d.note,
    });
    setOpen(true);
  }
  function openCopy(d: BusinessDocument) {
    setEditingId(null);
    setDraft({
      docType: d.docType, docNo: "", issueDate: todayISO(), status: "작성중",
      clientName: d.clientName, clientBizNo: d.clientBizNo ?? "", clientContact: d.clientContact ?? "",
      clientPhone: d.clientPhone ?? "", clientAddress: d.clientAddress ?? "",
      currency: d.currency, taxMode: d.taxMode, taxRate: d.taxRate,
      items: d.items.map((x) => ({ ...x })), note: d.note,
    });
    setOpen(true);
  }

  function patch(p: Partial<Draft>) { setDraft((d) => ({ ...d, ...p })); }

  function setLine(i: number, p: Partial<DocumentLineItem>) {
    setDraft((d) => {
      const items = d.items.map((it, idx) => (idx === i ? { ...it, ...p } : it));
      const ln = items[i];
      items[i] = { ...ln, amount: lineAmount(ln.qty, ln.unitPrice) };
      return { ...d, items };
    });
  }
  const addLine = () => setDraft((d) => ({ ...d, items: [...d.items, emptyLine()] }));
  const removeLine = (i: number) => setDraft((d) => ({ ...d, items: d.items.length > 1 ? d.items.filter((_, idx) => idx !== i) : d.items }));

  const totals = useMemo(() => computeTotals(draft.items, draft.taxMode, draft.taxRate), [draft.items, draft.taxMode, draft.taxRate]);

  async function post(body: unknown) {
    const res = await fetch("/api/documents", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) { alert(json.error ?? "처리 실패"); return null; }
    return json.data as BusinessDocument;
  }

  async function submit(publish: boolean) {
    if (!draft.clientName.trim()) { alert("거래처명을 입력하세요."); return; }
    setBusy(true);
    try {
      const payload = { ...draft, status: publish ? "발행" : draft.status };
      const d = editingId
        ? await post({ action: "update", id: editingId, patch: payload })
        : await post({ action: "create", data: payload });
      if (!d) return;
      setDocs((arr) => editingId ? arr.map((x) => (x.id === editingId ? d : x)) : [d, ...arr]);
      setOpen(false);
      router.refresh();
    } finally { setBusy(false); }
  }

  async function changeStatus(d: BusinessDocument, status: BusinessDocument["status"]) {
    if (status === "취소" && !confirm(`${d.docNo} 문서를 취소할까요?`)) return;
    const r = await post({ action: "status", id: d.id, status });
    if (r) { setDocs((arr) => arr.map((x) => (x.id === d.id ? r : x))); router.refresh(); }
  }
  async function remove(d: BusinessDocument) {
    if (!confirm(`${d.docNo} 문서를 완전히 삭제할까요?`)) return;
    const res = await fetch("/api/documents", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", id: d.id }),
    });
    if (res.ok) { setDocs((arr) => arr.filter((x) => x.id !== d.id)); router.refresh(); }
  }

  function printDraft() {
    const preview = recalcDocument({ ...draft, id: "preview", createdAt: "", updatedAt: "" } as BusinessDocument) as BusinessDocument;
    printDocument(preview);
  }

  const TABS: (DocumentType | "전체")[] = ["전체", ...DOCUMENT_TYPES];

  return (
    <div>
      <PageHeader
        title="거래문서"
        description="견적서 · 거래명세서 · 인보이스 · 발주서를 작성하고 인쇄(PDF)합니다."
        actions={<button className="btn-primary" onClick={openNew}><Plus size={16} /> 새 문서</button>}
      />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex items-center gap-1 rounded-lg border border-border bg-bg-panel p-1">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${typeFilter === t ? "bg-beige-100 text-ink-900 font-medium" : "text-ink-600 hover:bg-bg-subtle"}`}>
              {t}
            </button>
          ))}
        </div>
        <input className="input max-w-xs" placeholder="문서번호·거래처 검색" value={query} onChange={(e) => setQuery(e.target.value)} />
        <label className="flex items-center gap-1.5 text-sm text-ink-600 ml-auto">
          <input type="checkbox" checked={showCancelled} onChange={(e) => setShowCancelled(e.target.checked)} /> 취소 표시
        </label>
      </div>

      <Table>
        <THead>
          <TR>
            <TH>종류</TH><TH>문서번호</TH><TH>작성일</TH><TH>거래처</TH>
            <TH className="text-right">합계금액</TH><TH>상태</TH><TH className="text-right">작업</TH>
          </TR>
        </THead>
        <TBody>
          {filtered.length === 0 ? (
            <TR><TD>문서가 없습니다. “새 문서”로 작성하세요.</TD><TD></TD><TD></TD><TD></TD><TD></TD><TD></TD><TD></TD></TR>
          ) : filtered.map((d) => (
            <TR key={d.id}>
              <TD><span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-md border ${TYPE_STYLE[d.docType]}`}>{d.docType}</span></TD>
              <TD><span className="font-mono text-xs">{d.docNo || "-"}</span></TD>
              <TD className="tabular-nums whitespace-nowrap">{d.issueDate}</TD>
              <TD className="font-medium text-ink-900">{d.clientName}</TD>
              <TD className="text-right tabular-nums">{fmtMoney(d.total, d.currency)}</TD>
              <TD><StatusBadge status={d.status} /></TD>
              <TD>
                <div className="flex items-center justify-end gap-1">
                  <button className="btn-ghost !px-2 !py-1 text-xs" title="인쇄 / PDF" onClick={() => printDocument(d)}><Printer size={13} /> 인쇄</button>
                  <button className={ICON_BTN} title="수정" onClick={() => openEdit(d)}><Pencil size={15} /></button>
                  <button className={ICON_BTN} title="복제" onClick={() => openCopy(d)}><Copy size={15} /></button>
                  {d.status !== "취소"
                    ? <button className={`${ICON_BTN} text-red-600`} title="삭제" onClick={() => remove(d)}><Trash2 size={15} /></button>
                    : <button className={`${ICON_BTN} text-red-600`} title="삭제" onClick={() => remove(d)}><Trash2 size={15} /></button>}
                </div>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>

      <Modal
        open={open} onClose={() => setOpen(false)}
        title={editingId ? "문서 수정" : "새 문서 작성"} width="max-w-4xl"
        footer={<>
          <button className="btn-ghost" onClick={printDraft}><Printer size={15} /> 미리보기 인쇄</button>
          <div className="flex-1" />
          <button className="btn-ghost" onClick={() => setOpen(false)}>닫기</button>
          <button className="btn-ghost" disabled={busy} onClick={() => submit(false)}>{busy ? "저장 중…" : "임시저장"}</button>
          <button className="btn-primary" disabled={busy} onClick={() => submit(true)}>발행 저장</button>
        </>}
      >
        <div className="space-y-4">
          {/* 기본 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div><label className="label">문서 종류</label>
              <select className="input" value={draft.docType} onChange={(e) => patch({ docType: e.target.value as DocumentType })}>
                {DOCUMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select></div>
            <div><label className="label">작성일</label>
              <input type="date" className="input" value={draft.issueDate} onChange={(e) => patch({ issueDate: e.target.value })} /></div>
            <div><label className="label">통화</label>
              <select className="input" value={draft.currency} onChange={(e) => patch({ currency: e.target.value })}>
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select></div>
            <div><label className="label">문서번호</label>
              <input className="input" placeholder="저장 시 자동" value={draft.docNo} onChange={(e) => patch({ docNo: e.target.value })} /></div>
          </div>

          {/* 거래처 */}
          <div className="border-t border-border pt-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div><label className="label">거래처명 *</label>
              <input className="input" value={draft.clientName} onChange={(e) => patch({ clientName: e.target.value })} /></div>
            <div><label className="label">사업자등록번호</label>
              <input className="input" value={draft.clientBizNo} onChange={(e) => patch({ clientBizNo: e.target.value })} /></div>
            <div><label className="label">담당자</label>
              <input className="input" value={draft.clientContact} onChange={(e) => patch({ clientContact: e.target.value })} /></div>
            <div><label className="label">연락처</label>
              <input className="input" value={draft.clientPhone} onChange={(e) => patch({ clientPhone: e.target.value })} /></div>
            <div className="sm:col-span-2"><label className="label">주소</label>
              <input className="input" value={draft.clientAddress} onChange={(e) => patch({ clientAddress: e.target.value })} /></div>
          </div>

          {/* 품목 */}
          <div className="border-t border-border pt-3">
            <div className="flex items-center justify-between mb-2">
              <div className="label mb-0">품목</div>
              <button className="btn-ghost text-sm" onClick={addLine}><Plus size={14} /> 행 추가</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-ink-500 text-xs">
                  <th className="text-left font-medium py-1 w-6">#</th>
                  <th className="text-left font-medium py-1">품명</th>
                  <th className="text-left font-medium py-1 w-20">규격</th>
                  <th className="text-right font-medium py-1 w-14">수량</th>
                  <th className="text-left font-medium py-1 w-14">단위</th>
                  <th className="text-right font-medium py-1 w-24">단가</th>
                  <th className="text-right font-medium py-1 w-24">금액</th>
                  <th className="w-6"></th>
                </tr></thead>
                <tbody>
                  {draft.items.map((it, i) => (
                    <tr key={i}>
                      <td className="py-1 text-ink-500">{i + 1}</td>
                      <td className="py-1 pr-1"><input className="input py-1" value={it.name} onChange={(e) => setLine(i, { name: e.target.value })} placeholder="품명" /></td>
                      <td className="py-1 pr-1"><input className="input py-1" value={it.spec || ""} onChange={(e) => setLine(i, { spec: e.target.value })} /></td>
                      <td className="py-1 pr-1"><input type="number" className="input py-1 text-right" value={it.qty} onChange={(e) => setLine(i, { qty: Number(e.target.value) })} /></td>
                      <td className="py-1 pr-1"><input className="input py-1" value={it.unit || ""} onChange={(e) => setLine(i, { unit: e.target.value })} /></td>
                      <td className="py-1 pr-1"><input type="number" className="input py-1 text-right" value={it.unitPrice} onChange={(e) => setLine(i, { unitPrice: Number(e.target.value) })} /></td>
                      <td className="py-1 text-right tabular-nums text-ink-700">{fmtMoney(it.amount, draft.currency)}</td>
                      <td className="py-1 text-right"><button className={`${ICON_BTN} text-red-500`} onClick={() => removeLine(i)}><X size={14} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 세금 + 합계 */}
          <div className="border-t border-border pt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">부가세 처리</label>
                  <select className="input" value={draft.taxMode} onChange={(e) => patch({ taxMode: e.target.value as TaxMode })}>
                    {TAX_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select></div>
                <div><label className="label">세율(%)</label>
                  <input type="number" className="input" value={draft.taxRate} disabled={draft.taxMode === "없음"} onChange={(e) => patch({ taxRate: Number(e.target.value) })} /></div>
              </div>
              <div><label className="label">비고</label>
                <textarea className="input min-h-[60px]" value={draft.note} onChange={(e) => patch({ note: e.target.value })} /></div>
            </div>
            <div className="bg-bg-subtle/60 rounded-lg border border-border p-4 self-start">
              <div className="flex justify-between py-1 text-sm"><span className="text-ink-600">공급가액</span><span className="tabular-nums">{fmtMoney(totals.subtotal, draft.currency)}</span></div>
              {draft.taxMode !== "없음" && <div className="flex justify-between py-1 text-sm"><span className="text-ink-600">부가세 ({draft.taxRate}%)</span><span className="tabular-nums">{fmtMoney(totals.tax, draft.currency)}</span></div>}
              <div className="flex justify-between pt-2 mt-1 border-t border-border font-semibold text-base"><span>합계금액</span><span className="tabular-nums">{fmtMoney(totals.total, draft.currency)}</span></div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}

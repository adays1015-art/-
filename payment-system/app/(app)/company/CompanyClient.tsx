"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Upload, Trash2 } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import type { CompanyInfo } from "@/types";

function SealPreview({ company }: { company: CompanyInfo }) {
  if (company.stampDataUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={company.stampDataUrl} alt="직인" className="w-20 h-20 object-contain" />;
  }
  const core = (company.name || "").replace(/\(주\)|\(유\)|주식회사|유한회사|\s/g, "") || (company.name || "도장");
  const size = core.length <= 2 ? 30 : core.length === 3 ? 24 : core.length === 4 ? 19 : 15;
  return (
    <svg viewBox="0 0 100 100" className="w-20 h-20">
      <circle cx="50" cy="50" r="46" fill="none" stroke="#c0392b" strokeWidth="3.5" />
      <circle cx="50" cy="50" r="40" fill="none" stroke="#c0392b" strokeWidth="1.2" />
      <text x="50" y="22" textAnchor="middle" fill="#c0392b" fontSize="11" fontWeight="700">대표이사</text>
      <text x="50" y="58" textAnchor="middle" fill="#c0392b" fontSize={size} fontWeight="800">{core}</text>
      <text x="50" y="82" textAnchor="middle" fill="#c0392b" fontSize="10" fontWeight="700">印</text>
    </svg>
  );
}

export default function CompanyClient({ initial }: { initial: CompanyInfo }) {
  const router = useRouter();
  const [c, setC] = useState<CompanyInfo>(initial);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function set(k: keyof CompanyInfo, v: string) { setC((p) => ({ ...p, [k]: v })); setSaved(false); }

  function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 600 * 1024) { alert("도장 이미지는 600KB 이하로 올려주세요. (배경 투명 PNG 권장)"); return; }
    const reader = new FileReader();
    reader.onload = () => { setC((p) => ({ ...p, stampDataUrl: String(reader.result) })); setSaved(false); };
    reader.readAsDataURL(f);
  }

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/company", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: c }),
      });
      if (!res.ok) { alert("저장 실패"); return; }
      setSaved(true);
      router.refresh();
    } finally { setBusy(false); }
  }

  const field = (label: string, key: keyof CompanyInfo, ph = "") => (
    <div>
      <label className="label">{label}</label>
      <input className="input" value={(c[key] as string) ?? ""} placeholder={ph} onChange={(e) => set(key, e.target.value)} />
    </div>
  );

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="회사 정보"
        description="문서 머리말·하단과 직인에 사용됩니다. 저장하면 모든 문서 인쇄에 반영됩니다."
        actions={<button className="btn-primary" disabled={busy} onClick={save}>
          <Save size={15} /> {busy ? "저장 중…" : saved ? "저장됨 ✓" : "저장"}</button>}
      />

      <div className="panel panel-pad space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {field("상호 *", "name", "(주)어나더데이")}
          {field("영문 상호 (인보이스)", "nameEn", "Another Day Inc.")}
          {field("대표자", "ceo", "홍길동")}
          {field("사업자등록번호", "bizNo", "000-00-00000")}
        </div>
        <div className="grid grid-cols-1 gap-3">
          {field("주소", "address", "서울특별시 …")}
          {field("영문 주소 (인보이스)", "addressEn", "Seoul, Korea")}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {field("전화", "phone")}
          {field("팩스", "fax")}
          {field("이메일", "email")}
        </div>

        <div className="border-t border-border pt-4">
          <div className="text-sm font-semibold text-ink-700 mb-2">입금 계좌 (거래명세서·인보이스 하단)</div>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            {field("은행", "bank")}
            {field("계좌번호", "account")}
            {field("예금주", "accountHolder")}
            {field("SWIFT (해외)", "swift")}
          </div>
        </div>

        <div className="border-t border-border pt-4">
          <div className="text-sm font-semibold text-ink-700 mb-2">직인 (도장)</div>
          <div className="flex items-center gap-5">
            <div className="shrink-0 border border-border rounded-lg p-2 bg-white">
              <SealPreview company={c} />
            </div>
            <div className="space-y-2">
              <p className="text-xs text-ink-500 leading-relaxed">
                도장 이미지를 올리지 않으면 <b>상호로 빨간 원형 직인이 자동 생성</b>되어 문서에 찍힙니다.<br />
                실제 인감 이미지를 쓰려면 <b>배경 투명 PNG</b>를 업로드하세요 (600KB 이하).
              </p>
              <div className="flex items-center gap-2">
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onUpload} />
                <button className="btn-ghost" onClick={() => fileRef.current?.click()}><Upload size={14} /> 도장 이미지 올리기</button>
                {c.stampDataUrl && (
                  <button className="btn-ghost text-red-600" onClick={() => set("stampDataUrl", "")}>
                    <Trash2 size={14} /> 자동 직인으로</button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="text-xs text-ink-400 mt-3">
        ※ 현재는 임시 저장(메모리) 모드라 재배포 시 초기화됩니다. 구글 시트 연동 후 영구 저장됩니다.
      </p>
    </div>
  );
}

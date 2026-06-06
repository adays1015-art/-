import { ArrowDown } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { getSheetsMode, SHEET_TABS } from "@/lib/googleSheets";
import { filterHiddenColumns } from "@/lib/hiddenUIFields";
import AdminGate from "@/components/AdminGate";

const FLOW = [
  {
    tab: SHEET_TABS.materials, title: "원료재고",
    desc: "안료·향료·왁스·바인더·패키지 등 모든 원재료. 품목 생산 시 BOM에 따라 자동 차감.",
    columns: ["id", "name", "category", "stock", "unit", "safetyStock", "supplier", "unitPrice", "inboundDate", "msds", "note"],
  },
  {
    tab: SHEET_TABS.items, title: "품목마스터 (핵심)",
    desc: "각 품목번호는 제품유형 × 색상의 고유한 조합. 자체 재고와 BOM을 가짐.",
    columns: ["id", "itemNo", "productType", "colorName", "status", "stock", "safetyStock", "unit", "note"],
  },
  {
    tab: SHEET_TABS.bom, title: "품목BOM",
    desc: "각 품목 1개 생산에 필요한 원료 라인.",
    columns: ["id", "itemNo", "materialId", "materialName", "materialCategory", "amountPerUnit", "unit", "note"],
  },
  {
    tab: SHEET_TABS.itemLots, title: "품목생산LOT",
    desc: "품목번호 단위 생산. 진행중/완료 시 BOM × 수량으로 원료 차감, 완료 시 품목 재고 증가.",
    columns: ["id", "date", "itemNo", "productType", "lotCode", "targetQty", "completedQty", "defectQty", "assignee", "status", "note"],
  },
  {
    tab: SHEET_TABS.setOptions, title: "세트옵션",
    desc: "판매 가능한 세트 옵션 (제품유형 × 세트유형 × 옵션명).",
    columns: ["id", "productType", "setSize", "optionName", "optionCode", "isActive", "note"],
  },
  {
    tab: SHEET_TABS.setComposition, title: "세트구성품목",
    desc: "세트 옵션이 어떤 품목번호 × 몇 개로 구성되는지.",
    columns: ["id", "setOptionId", "itemNo", "order", "qty", "note"],
  },
  {
    tab: SHEET_TABS.setAssemblyLots, title: "세트조립LOT",
    desc: "세트 단위 조립. 진행중/완료 시 구성 품목 재고 차감, 완료 시 완제품 세트 재고 증가.",
    columns: ["id", "date", "setOptionId", "productType", "setSize", "optionName", "qty", "assignee", "status", "note"],
  },
  {
    tab: SHEET_TABS.finishedSets, title: "완제품세트재고",
    desc: "조립이 완료된 판매 가능 세트 재고. 출고 시 차감.",
    columns: ["id", "productType", "setSize", "optionName", "optionCode", "stock", "reserved", "location", "lastProducedAt"],
  },
  {
    tab: SHEET_TABS.shipments, title: "출고이력",
    desc: "완제품 세트 출고 기록. 원료·품목 재고는 영향받지 않음.",
    columns: ["id", "date", "productType", "setSize", "optionName", "optionCode", "qty", "customer", "assignee", "note"],
  },
  {
    tab: SHEET_TABS.history, title: "작업이력",
    desc: "모든 운영 동작의 감사 로그.",
    columns: ["id", "time", "type", "target", "change", "assignee", "note"],
  },
  {
    tab: SHEET_TABS.cost, title: "원가설정",
    desc: "항목별 원가 설정 (인건비/패키지비/수수료 등).",
    columns: ["id", "name", "amount", "unit", "basis", "note"],
  },
];

export default async function SchemaPage() {
  const mode = await getSheetsMode();
  const label = mode === "mock" ? "샘플 데이터 모드"
    : mode === "oauth" ? "OAuth 사용자 인증 모드"
    : "서비스 계정 모드";
  return (
    <AdminGate>
    <div>
      <PageHeader
        title="데이터 구조"
        description="3단계 재고 흐름과 Google Sheets 탭 구조를 시각화합니다."
      />

      <div className={`panel panel-pad mb-6 ${mode === "mock" ? "border-amber-300" : "border-emerald-200"}`}>
        <div className="text-sm">현재 모드: <span className="font-semibold">{label}</span></div>
        <p className="text-sm text-ink-600 mt-2 leading-relaxed">
          이 시스템의 Sheets 연결은 3가지 모드를 지원합니다 — <b>mock</b>(샘플 데이터),{" "}
          <b>oauth</b>(로그인한 사용자 권한 — 서비스 계정 키 불필요),{" "}
          <b>service-account</b>(서비스 계정 키). <a href="/settings/sheets" className="text-beige-600 hover:underline">Google Sheets 연결 페이지</a>에서 설정·전환할 수 있습니다.
        </p>
      </div>

      <div className="panel panel-pad mb-6">
        <div className="text-sm font-semibold text-ink-900 mb-3">재고 흐름 (3 levels)</div>
        <div className="text-sm font-mono text-ink-700 leading-7 whitespace-pre-wrap">
{`[원료재고]   안료·향료·왁스·바인더·패키지 …
      ↓ (품목생산LOT — BOM × 수량으로 자동 차감)
[품목재고]   101번, 102번, 201번, 301번 …
      ↓ (세트조립LOT — 세트구성 × 세트수량으로 자동 차감)
[완제품 세트 재고]  거베라 10색, 플로럴 10색, 과실 10색 …
      ↓ (출고이력)
[고객/거래처]`}
        </div>
      </div>

      <div className="space-y-3">
        {FLOW.map((f, idx) => (
          <div key={f.tab}>
            <div className="panel panel-pad">
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="text-xs uppercase tracking-wider text-ink-500">시트 탭</div>
                  <div className="text-lg font-semibold text-ink-900 mt-0.5">
                    <span className="font-mono mr-2 text-beige-600">{f.tab}</span>
                    <span className="text-ink-700 text-base">— {f.title}</span>
                  </div>
                </div>
              </div>
              <p className="text-sm text-ink-600 mt-2 leading-relaxed">{f.desc}</p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {/* Filter hidden UI fields BEFORE rendering — see lib/hiddenUIFields. */}
                {filterHiddenColumns(f.tab, f.columns).map((c) => (
                  <span key={c} className="text-[11px] font-mono px-2 py-0.5 rounded bg-bg-subtle text-ink-700 border border-border">
                    {c}
                  </span>
                ))}
              </div>
            </div>
            {idx < FLOW.length - 1 && (
              <div className="flex justify-center py-2"><ArrowDown size={18} className="text-ink-400" /></div>
            )}
          </div>
        ))}
      </div>

      <div className="panel panel-pad mt-8">
        <div className="text-sm font-semibold text-ink-900 mb-2">자동화된 흐름</div>
        <ol className="list-decimal list-inside text-sm text-ink-700 leading-relaxed space-y-1">
          <li>품목 생산 LOT 상태를 <b>진행중/완료</b>로 두면 → 그 품목의 BOM × 수량으로 <b>원료 재고가 자동 차감</b>됩니다.</li>
          <li>품목 생산 LOT 상태를 <b>완료</b>로 두면 → 해당 <b>품목번호 재고</b>가 증가합니다.</li>
          <li>세트 조립 LOT 상태를 <b>진행중/완료</b>로 두면 → 세트 구성 × 세트수량으로 <b>품목 재고가 자동 차감</b>됩니다.</li>
          <li>세트 조립 LOT 상태를 <b>완료</b>로 두면 → 해당 <b>완제품 세트 재고</b>가 증가합니다.</li>
          <li>출고 등록 시 → <b>완제품 세트 재고</b>만 차감되고 작업 이력이 기록됩니다. 원료/품목 재고는 건드리지 않습니다.</li>
          <li>품목 상세 페이지(/items/[번호])에서 → 해당 품목의 BOM, 재고, 생산 이력, 포함된 세트, 부족 예상까지 한 화면에서 추적할 수 있습니다.</li>
        </ol>
      </div>

      <div className="panel panel-pad mt-6">
        <div className="text-sm font-semibold text-ink-900 mb-2">인증</div>
        <p className="text-sm text-ink-700 leading-relaxed">
          Google OAuth 로그인 + 이메일 화이트리스트로 접속을 제한합니다.
          <code className="font-mono text-xs bg-bg-subtle px-1 rounded mx-0.5">ALLOWED_EMAIL_DOMAIN</code> 의 도메인 또는
          <code className="font-mono text-xs bg-bg-subtle px-1 rounded mx-0.5">ALLOWED_EMAILS</code> 에 등록된 이메일만 접속할 수 있습니다.
          미승인 계정은 자동으로 <code className="font-mono text-xs">/denied</code> 페이지로 안내됩니다.
        </p>
      </div>
    </div>
    </AdminGate>
  );
}

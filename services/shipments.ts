import type { ProductType, SetSize, Shipment, ShipmentLine } from "@/types";
import {
  appendRow,
  useSheets,
  readRows,
  SHEET_TABS,
} from "@/lib/googleSheets";
import { getStore } from "./store";
import { genId } from "@/lib/utils";
import { shipFinishedSet } from "./finishedSets";
import { consumeItems as consumeUpcycleItems } from "./upcycleItems";
import { consumeItems as consumeMainItems } from "./items";
import { logWork } from "./history";

const TAB = SHEET_TABS.shipments;

// 시트 헤더 — 기존 컬럼 + 거래처마스터 연동용 신규 5개 컬럼.
// 사용자가 시트에 5개 컬럼을 추가하지 않은 경우 Apps Script 가 빈 칸으로
// 처리 (read 시 undefined, write 시 무시) → 기존 데이터/동작 그대로 유지.
export const SHIPMENT_HEADER = [
  "id", "date", "productType", "setSize", "optionName", "optionCode",
  "qty", "customer", "assignee", "note",
  "clientCode", "clientName", "contactName", "country", "region",
  "unitPrice", "commissionRate", "line",
];

function toRow(s: Shipment): (string | number | boolean)[] {
  return [
    s.id, s.date, s.productType, s.setSize, s.optionName, s.optionCode,
    s.qty, s.customer, s.assignee, s.note,
    s.clientCode ?? "", s.clientName ?? "", s.contactName ?? "",
    s.country ?? "", s.region ?? "",
    s.unitPrice ?? 0, s.commissionRate ?? 0, s.line ?? "기존",
  ];
}

function fromRow(r: Record<string, string>): Shipment {
  // customer 컬럼은 옛 시트 호환 — 거래처마스터 연동된 새 row 에서는
  // clientName 컬럼을 채우고 customer 에도 같이 기록합니다.
  const clientName = r.clientName ?? "";
  return {
    id: r.id ?? "",
    date: r.date ?? "",
    productType: (r.productType as ProductType) ?? "오일파스텔",
    setSize: (r.setSize as SetSize) ?? "10색",
    optionName: r.optionName ?? "",
    optionCode: r.optionCode ?? "",
    qty: Number(r.qty) || 0,
    customer: r.customer ?? clientName ?? "",
    assignee: r.assignee ?? "",
    note: r.note ?? "",
    clientCode: r.clientCode ?? "",
    clientName,
    contactName: r.contactName ?? "",
    country: r.country ?? "",
    region: r.region ?? "",
    unitPrice: Number(r.unitPrice) || 0,
    commissionRate: Number(r.commissionRate) || 0,
    line: (r.line as ShipmentLine) || "기존",
  };
}

export async function listShipments(): Promise<Shipment[]> {
  if ((await useSheets())) {
    const rows = await readRows<Record<string, string>>(TAB);
    return rows.map(fromRow).sort((a, b) => (a.date > b.date ? -1 : 1));
  }
  return [...getStore().shipments].sort((a, b) => (a.date > b.date ? -1 : 1));
}

/**
 * Create a shipment record. Decrements completed-set stock and logs.
 * Does NOT touch raw materials or individual item stock.
 */
export async function createShipment(input: Omit<Shipment, "id">): Promise<{ shipment: Shipment; warning?: string }> {
  const line: ShipmentLine = input.line ?? "기존";
  let warning: string | undefined;

  if (line === "업사이클") {
    // 업사이클 제품: 업사이클 품목 재고(optionCode = itemNo)를 차감.
    const res = await consumeUpcycleItems([{ itemNo: input.optionCode, amount: input.qty }]);
    if (!res.ok) {
      warning = `업사이클 품목 재고 부족 — ${input.optionCode}`;
    }
  } else if (line === "품목") {
    // 개별 품목(서비스 출고): 품목마스터 재고(optionCode = itemNo)를 차감.
    const res = await consumeMainItems([{ itemNo: input.optionCode, amount: input.qty }]);
    if (!res.ok) {
      warning = `품목 재고 부족 — ${input.optionCode}`;
    }
  } else {
    // 기존: 완제품 세트 재고를 optionCode 로 차감.
    const ship = await shipFinishedSet(input.optionCode, input.qty);
    if (!ship.ok) {
      warning = ship.available !== undefined
        ? `완제품 세트 재고 부족 — 가용 ${ship.available}세트`
        : `해당 옵션코드의 완제품 재고가 없습니다`;
    }
  }

  const s: Shipment = { ...input, line, id: genId("SH") };
  if ((await useSheets())) await appendRow(TAB, toRow(s), SHIPMENT_HEADER);
  else getStore().shipments.unshift(s);

  const lineTag = line === "업사이클" ? "[업사이클] " : line === "품목" ? "[품목] " : "";
  const unit = line === "기존" ? "세트" : "개";
  await logWork({
    type: "출고",
    target: `${lineTag}${s.productType} ${s.setSize} ${s.optionName}`,
    change: `-${s.qty}${unit} (${s.customer})`,
    assignee: s.assignee,
    note: warning ?? s.note,
  });

  return { shipment: s, warning };
}

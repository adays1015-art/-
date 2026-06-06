import type { LotStatus, ProductType, SetAssemblyLot, SetSize } from "@/types";
import {
  appendRow,
  findRowNumberByColumn,
  useSheets,
  readRows,
  SHEET_TABS,
  updateRow,
} from "@/lib/googleSheets";
import { getStore } from "./store";
import { genId, todayISO } from "@/lib/utils";
import { listCompositionForOption, listSetOptions } from "./setOptions";
import { computeSetItemConsumption } from "@/lib/bomMath";
import { consumeItems } from "./items";
import { addFinishedSet } from "./finishedSets";
import { logWork } from "./history";

const TAB = SHEET_TABS.setAssemblyLots;

export const SET_ASSEMBLY_HEADER = [
  "id", "date", "setOptionId", "productType", "setSize", "optionName",
  "qty", "assignee", "status", "note",
];

function toRow(l: SetAssemblyLot): (string | number | boolean)[] {
  return [
    l.id, l.date, l.setOptionId, l.productType, l.setSize, l.optionName,
    l.qty, l.assignee, l.status, l.note,
  ];
}

function fromRow(r: Record<string, string>): SetAssemblyLot {
  return {
    id: r.id ?? "",
    date: r.date ?? "",
    setOptionId: r.setOptionId ?? "",
    productType: (r.productType as ProductType) ?? "오일파스텔",
    setSize: (r.setSize as SetSize) ?? "10색",
    optionName: r.optionName ?? "",
    qty: Number(r.qty) || 0,
    assignee: r.assignee ?? "",
    status: (r.status as LotStatus) ?? "예정",
    note: r.note ?? "",
  };
}

export async function listSetAssemblyLots(): Promise<SetAssemblyLot[]> {
  if ((await useSheets())) {
    const rows = await readRows<Record<string, string>>(TAB);
    return rows.map(fromRow);
  }
  return getStore().setAssemblyLots;
}

/**
 * Consume item stock for this assembly lot based on its set composition × qty.
 */
async function consumeForAssembly(lot: SetAssemblyLot): Promise<string | undefined> {
  const comp = await listCompositionForOption(lot.setOptionId);
  if (comp.length === 0) return `세트 구성 미정의`;
  const uses = computeSetItemConsumption(comp, lot.qty);
  const result = await consumeItems(uses.map((u) => ({ itemNo: u.itemNo, amount: u.amount })));
  await logWork({
    type: "세트 조립",
    target: `${lot.productType} ${lot.setSize} ${lot.optionName}`,
    change: `${uses.length}품목 × ${lot.qty}세트`,
    assignee: lot.assignee,
    note: result.ok ? "정상 차감" : `품목 재고 부족: ${result.missing.join(", ")}`,
  });
  return result.ok ? undefined : `품목 재고 부족 — ${result.missing.length}품목 (${result.missing.join(", ")})`;
}

async function findOption(setOptionId: string) {
  return (await listSetOptions()).find((o) => o.id === setOptionId);
}

export async function createSetAssemblyLot(
  input: Omit<SetAssemblyLot, "id" | "productType" | "setSize" | "optionName"> & {
    productType?: ProductType;
    setSize?: SetSize;
    optionName?: string;
  },
): Promise<{ lot: SetAssemblyLot; warning?: string }> {
  const opt = await findOption(input.setOptionId);
  const lot: SetAssemblyLot = {
    id: genId("SA"),
    date: input.date,
    setOptionId: input.setOptionId,
    productType: input.productType ?? opt?.productType ?? "오일파스텔",
    setSize: input.setSize ?? opt?.setSize ?? "10색",
    optionName: input.optionName ?? opt?.optionName ?? "",
    qty: input.qty,
    assignee: input.assignee,
    status: input.status,
    note: input.note,
  };

  let warning: string | undefined;
  if (lot.status === "진행중" || lot.status === "완료") {
    warning = await consumeForAssembly(lot);
  }

  if ((await useSheets())) await appendRow(TAB, toRow(lot), SET_ASSEMBLY_HEADER);
  else getStore().setAssemblyLots.unshift(lot);

  await logWork({
    type: "세트 조립",
    target: `${lot.productType} ${lot.setSize} ${lot.optionName}`,
    change: `목표 ${lot.qty}세트 · 상태 ${lot.status}`,
    assignee: lot.assignee,
    note: lot.note,
  });

  if (lot.status === "완료" && opt) {
    await addFinishedSet({
      productType: opt.productType,
      setSize: opt.setSize,
      optionName: opt.optionName,
      optionCode: opt.optionCode,
      qty: lot.qty,
    });
    await logWork({
      type: "세트 입고",
      target: `${opt.productType} ${opt.setSize} ${opt.optionName}`,
      change: `+${lot.qty}세트`,
      assignee: lot.assignee,
      note: `조립 LOT ${lot.id}`,
    });
  }

  return { lot, warning };
}

export async function updateSetAssemblyLot(
  id: string,
  patch: Partial<SetAssemblyLot>,
): Promise<SetAssemblyLot | null> {
  const existing = (await listSetAssemblyLots()).find((l) => l.id === id);
  if (!existing) return null;
  const merged: SetAssemblyLot = { ...existing, ...patch, id };

  const becameProgressing =
    (patch.status === "진행중" || patch.status === "완료") &&
    existing.status !== "진행중" &&
    existing.status !== "완료";
  let warning: string | undefined;
  if (becameProgressing) {
    warning = await consumeForAssembly(merged);
  }

  if ((await useSheets())) {
    const rowNum = await findRowNumberByColumn(TAB, "id", id);
    if (rowNum) await updateRow(TAB, rowNum, toRow(merged), SET_ASSEMBLY_HEADER);
  } else {
    const store = getStore().setAssemblyLots;
    const idx = store.findIndex((l) => l.id === id);
    if (idx !== -1) store[idx] = merged;
  }

  if (patch.status && patch.status !== existing.status) {
    await logWork({
      type: patch.status === "완료" ? "세트 입고" : "수정",
      target: `${merged.productType} ${merged.setSize} ${merged.optionName}`,
      change: `상태 ${existing.status} → ${patch.status}`,
      assignee: merged.assignee,
      note: warning ?? merged.note,
    });
  }

  if (patch.status === "완료" && existing.status !== "완료") {
    const opt = await findOption(merged.setOptionId);
    if (opt) {
      await addFinishedSet({
        productType: opt.productType,
        setSize: opt.setSize,
        optionName: opt.optionName,
        optionCode: opt.optionCode,
        qty: merged.qty,
      });
      await logWork({
        type: "세트 입고",
        target: `${opt.productType} ${opt.setSize} ${opt.optionName}`,
        change: `+${merged.qty}세트`,
        assignee: merged.assignee,
        note: `조립 LOT ${merged.id}`,
        time: todayISO(),
      });
    }
  }

  return merged;
}

import type { ItemBomLine, SetComposition } from "@/types";

/**
 * Aggregate raw material consumption for producing `qty` pieces of an item.
 *
 * Pure function — safe to import from client components.
 */
export function computeItemConsumption(
  bom: ItemBomLine[],
  qty: number,
): { materialId: string; materialName: string; amount: number; unit: string }[] {
  const out: { materialId: string; materialName: string; amount: number; unit: string }[] = [];
  for (const line of bom) {
    out.push({
      materialId: line.materialId,
      materialName: line.materialName,
      amount: Math.round(line.amountPerUnit * qty * 100) / 100,
      unit: line.unit,
    });
  }
  return out;
}

/**
 * Aggregate item-number consumption for assembling `qty` sets of a set option.
 */
export function computeSetItemConsumption(
  composition: SetComposition[],
  qty: number,
): { itemNo: string; amount: number; order: number }[] {
  return composition
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((c) => ({ itemNo: c.itemNo, amount: c.qty * qty, order: c.order }));
}

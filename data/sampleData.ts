import type {
  Material,
  Item,
  ItemBomLine,
  ItemLot,
  SetOption,
  SetComposition,
  SetAssemblyLot,
  FinishedSet,
  Shipment,
  WorkLog,
  CostItem,
} from "@/types";

// ─── Raw materials ─────────────────────────────────────────
export const sampleMaterials: Material[] = [
  // 안료
  { id: "M-001", name: "티타늄 화이트 안료", category: "안료", stock: 4200, unit: "g", safetyStock: 2000, supplier: "한국안료", unitPrice: 18, inboundDate: "2026-04-12", expiryDate: "2028-04-12", msds: true, note: "" },
  { id: "M-002", name: "울트라마린 블루 안료", category: "안료", stock: 1400, unit: "g", safetyStock: 1500, supplier: "한국안료", unitPrice: 42, inboundDate: "2026-03-22", expiryDate: "2028-03-22", msds: true, note: "" },
  { id: "M-003", name: "카드뮴 옐로 안료", category: "안료", stock: 980, unit: "g", safetyStock: 1000, supplier: "프랑스 P.B", unitPrice: 76, inboundDate: "2026-02-18", expiryDate: "2028-02-18", msds: true, note: "" },
  { id: "M-004", name: "카드뮴 레드 안료", category: "안료", stock: 880, unit: "g", safetyStock: 800, supplier: "프랑스 P.B", unitPrice: 84, inboundDate: "2026-03-05", expiryDate: "2028-03-05", msds: true, note: "" },
  { id: "M-005", name: "번트 시에나 안료", category: "안료", stock: 1500, unit: "g", safetyStock: 600, supplier: "한국안료", unitPrice: 38, inboundDate: "2026-04-02", expiryDate: "2028-04-02", msds: true, note: "" },
  { id: "M-006", name: "비올렛 안료", category: "안료", stock: 540, unit: "g", safetyStock: 600, supplier: "한국안료", unitPrice: 52, inboundDate: "2026-03-30", expiryDate: "2028-03-30", msds: true, note: "" },
  { id: "M-007", name: "비리디안 그린 안료", category: "안료", stock: 720, unit: "g", safetyStock: 500, supplier: "한국안료", unitPrice: 48, inboundDate: "2026-04-10", expiryDate: "2028-04-10", msds: true, note: "" },
  { id: "M-008", name: "카본 블랙 안료", category: "안료", stock: 620, unit: "g", safetyStock: 400, supplier: "한국안료", unitPrice: 28, inboundDate: "2026-03-15", expiryDate: "2028-03-15", msds: true, note: "" },

  // 향료
  { id: "M-101", name: "로즈 향료", category: "향료", stock: 410, unit: "ml", safetyStock: 300, supplier: "Aromatic Lab", unitPrice: 360, inboundDate: "2026-04-22", expiryDate: "2027-04-22", msds: true, note: "플로럴" },
  { id: "M-102", name: "프리지아 향료", category: "향료", stock: 220, unit: "ml", safetyStock: 250, supplier: "Aromatic Lab", unitPrice: 340, inboundDate: "2026-04-18", expiryDate: "2027-04-18", msds: true, note: "튤립 옵션용" },
  { id: "M-103", name: "라벤더 에센셜 오일", category: "향료", stock: 820, unit: "ml", safetyStock: 500, supplier: "Aromatic Lab", unitPrice: 240, inboundDate: "2026-05-02", expiryDate: "2027-05-02", msds: true, note: "" },
  { id: "M-104", name: "베르가못 향료", category: "향료", stock: 340, unit: "ml", safetyStock: 400, supplier: "Aromatic Lab", unitPrice: 320, inboundDate: "2026-04-30", expiryDate: "2027-04-30", msds: true, note: "시트러스" },
  { id: "M-105", name: "삼나무 우드 향료", category: "향료", stock: 510, unit: "ml", safetyStock: 300, supplier: "Aromatic Lab", unitPrice: 280, inboundDate: "2026-04-15", expiryDate: "2027-04-15", msds: true, note: "" },

  // 왁스 / 오일 / 바인더
  { id: "M-201", name: "비즈 왁스", category: "왁스", stock: 6300, unit: "g", safetyStock: 2000, supplier: "그린왁스", unitPrice: 22, inboundDate: "2026-03-10", expiryDate: "2028-03-10", msds: false, note: "" },
  { id: "M-202", name: "소이 왁스", category: "왁스", stock: 8800, unit: "g", safetyStock: 3000, supplier: "그린왁스", unitPrice: 14, inboundDate: "2026-04-01", expiryDate: "2028-04-01", msds: false, note: "" },
  { id: "M-203", name: "코코넛 오일", category: "오일", stock: 4400, unit: "ml", safetyStock: 1500, supplier: "오가닉소스", unitPrice: 32, inboundDate: "2026-04-20", expiryDate: "2027-10-20", msds: false, note: "" },
  { id: "M-204", name: "아라비아 검 바인더", category: "바인더", stock: 1200, unit: "g", safetyStock: 800, supplier: "ArtBind", unitPrice: 88, inboundDate: "2026-03-12", expiryDate: "2028-03-12", msds: true, note: "" },
  { id: "M-205", name: "글리세린 바인더", category: "바인더", stock: 950, unit: "ml", safetyStock: 500, supplier: "ArtBind", unitPrice: 62, inboundDate: "2026-04-05", expiryDate: "2028-04-05", msds: true, note: "고체물감 보습제" },

  // 패키지 / 스티커
  { id: "M-301", name: "오일파스텔 종이 슬리브", category: "패키지", stock: 4200, unit: "ea", safetyStock: 1000, supplier: "페이퍼하우스", unitPrice: 35, inboundDate: "2026-04-12", expiryDate: "", msds: false, note: "스틱 1개당 1매" },
  { id: "M-302", name: "수채물감 5ml 튜브", category: "용기", stock: 2400, unit: "ea", safetyStock: 800, supplier: "글래스코", unitPrice: 180, inboundDate: "2026-04-25", expiryDate: "", msds: false, note: "" },
  { id: "M-303", name: "고체물감 팬 트레이", category: "용기", stock: 1100, unit: "ea", safetyStock: 600, supplier: "글래스코", unitPrice: 90, inboundDate: "2026-04-25", expiryDate: "", msds: false, note: "1색 1팬" },
  { id: "M-304", name: "Another Day 로고 스티커", category: "스티커", stock: 2200, unit: "ea", safetyStock: 500, supplier: "프린트팜", unitPrice: 60, inboundDate: "2026-04-22", expiryDate: "", msds: false, note: "" },
];

// ─── Items (품목마스터) — 30 items ──────────────────────────
// 오일파스텔 100번대 (10개), 수채 200번대 (10개), 고체 300번대 (10개)
type ItemSeed = Omit<Item, "id" | "productionUnit" | "unit" | "status" | "safetyStock"> & {
  productionUnit?: number;
  unit?: string;
  status?: Item["status"];
  safetyStock?: number;
};

const seedItems: ItemSeed[] = [
  // 오일파스텔 거베라 옵션 (101~110) — 10색
  { itemNo: "101", productType: "오일파스텔", colorName: "거베라 레드", colorCode: "OP-R-01", scentName: "로즈",  scentCode: "S-ROSE",  stock: 320, note: "" },
  { itemNo: "102", productType: "오일파스텔", colorName: "거베라 옐로", colorCode: "OP-Y-01", scentName: "로즈",  scentCode: "S-ROSE",  stock: 280, note: "" },
  { itemNo: "103", productType: "오일파스텔", colorName: "거베라 살구", colorCode: "OP-A-01", scentName: "로즈",  scentCode: "S-ROSE",  stock: 260, note: "" },
  { itemNo: "104", productType: "오일파스텔", colorName: "거베라 브라운", colorCode: "OP-B-01", scentName: "로즈",  scentCode: "S-ROSE",  stock: 240, note: "" },
  { itemNo: "105", productType: "오일파스텔", colorName: "거베라 코랄", colorCode: "OP-C-01", scentName: "로즈",  scentCode: "S-ROSE",  stock: 200, note: "" },
  { itemNo: "106", productType: "오일파스텔", colorName: "거베라 화이트", colorCode: "OP-W-01", scentName: "로즈",  scentCode: "S-ROSE",  stock: 360, note: "" },
  { itemNo: "107", productType: "오일파스텔", colorName: "거베라 핑크", colorCode: "OP-P-01", scentName: "로즈",  scentCode: "S-ROSE",  stock: 220, note: "" },
  { itemNo: "108", productType: "오일파스텔", colorName: "거베라 그린", colorCode: "OP-G-01", scentName: "로즈",  scentCode: "S-ROSE",  stock: 180, note: "" },
  { itemNo: "109", productType: "오일파스텔", colorName: "거베라 바이올렛", colorCode: "OP-V-01", scentName: "로즈",  scentCode: "S-ROSE",  stock: 150, note: "" },
  { itemNo: "110", productType: "오일파스텔", colorName: "거베라 블랙", colorCode: "OP-K-01", scentName: "로즈",  scentCode: "S-ROSE",  stock: 80,  safetyStock: 120, note: "" },

  // 수채물감 플로럴 옵션 (201~210) — 10색 (스펙은 12색 옵션이지만 시드 단순화)
  { itemNo: "201", productType: "수채물감", colorName: "플로럴 로즈레드", colorCode: "WC-R-01", scentName: "로즈",      scentCode: "S-ROSE",      stock: 410, note: "" },
  { itemNo: "202", productType: "수채물감", colorName: "플로럴 피치", colorCode: "WC-P-01", scentName: "로즈",      scentCode: "S-ROSE",      stock: 380, note: "" },
  { itemNo: "203", productType: "수채물감", colorName: "플로럴 옐로", colorCode: "WC-Y-01", scentName: "프리지아",  scentCode: "S-FRESIA",   stock: 350, note: "" },
  { itemNo: "204", productType: "수채물감", colorName: "플로럴 라임",  colorCode: "WC-G-01", scentName: "프리지아",  scentCode: "S-FRESIA",   stock: 300, note: "" },
  { itemNo: "205", productType: "수채물감", colorName: "플로럴 스카이",  colorCode: "WC-S-01", scentName: "프리지아",  scentCode: "S-FRESIA",   stock: 290, note: "" },
  { itemNo: "206", productType: "수채물감", colorName: "플로럴 라일락",  colorCode: "WC-V-01", scentName: "로즈",      scentCode: "S-ROSE",      stock: 220, note: "" },
  { itemNo: "207", productType: "수채물감", colorName: "플로럴 베이지",  colorCode: "WC-A-01", scentName: "로즈",      scentCode: "S-ROSE",      stock: 260, note: "" },
  { itemNo: "208", productType: "수채물감", colorName: "플로럴 모카",    colorCode: "WC-B-01", scentName: "라벤더",    scentCode: "S-LAVENDER", stock: 240, note: "" },
  { itemNo: "209", productType: "수채물감", colorName: "플로럴 차콜",    colorCode: "WC-K-01", scentName: "라벤더",    scentCode: "S-LAVENDER", stock: 200, note: "" },
  { itemNo: "210", productType: "수채물감", colorName: "플로럴 화이트",  colorCode: "WC-W-01", scentName: "라벤더",    scentCode: "S-LAVENDER", stock: 80, safetyStock: 120, note: "" },

  // 고체물감 과실 옵션 (301~310) — 10색
  { itemNo: "301", productType: "고체물감", colorName: "체리 레드",   colorCode: "SP-R-01", scentName: "베르가못", scentCode: "S-BERGAMOT", stock: 180, note: "" },
  { itemNo: "302", productType: "고체물감", colorName: "오렌지",      colorCode: "SP-O-01", scentName: "베르가못", scentCode: "S-BERGAMOT", stock: 200, note: "" },
  { itemNo: "303", productType: "고체물감", colorName: "옐로",        colorCode: "SP-Y-01", scentName: "베르가못", scentCode: "S-BERGAMOT", stock: 220, note: "" },
  { itemNo: "304", productType: "고체물감", colorName: "라임",        colorCode: "SP-G-01", scentName: "삼나무",   scentCode: "S-CEDAR",    stock: 160, note: "" },
  { itemNo: "305", productType: "고체물감", colorName: "민트",        colorCode: "SP-M-01", scentName: "삼나무",   scentCode: "S-CEDAR",    stock: 140, note: "" },
  { itemNo: "306", productType: "고체물감", colorName: "블루베리",    colorCode: "SP-B-01", scentName: "베르가못", scentCode: "S-BERGAMOT", stock: 150, note: "" },
  { itemNo: "307", productType: "고체물감", colorName: "포도",        colorCode: "SP-V-01", scentName: "베르가못", scentCode: "S-BERGAMOT", stock: 130, note: "" },
  { itemNo: "308", productType: "고체물감", colorName: "복숭아",      colorCode: "SP-P-01", scentName: "로즈",     scentCode: "S-ROSE",     stock: 170, note: "" },
  { itemNo: "309", productType: "고체물감", colorName: "초콜릿",      colorCode: "SP-K-01", scentName: "삼나무",   scentCode: "S-CEDAR",    stock: 110, note: "" },
  { itemNo: "310", productType: "고체물감", colorName: "코코넛",      colorCode: "SP-W-01", scentName: "로즈",     scentCode: "S-ROSE",     stock: 60, safetyStock: 100, note: "" },
];

function defaultUnitFor(t: ItemSeed): { unit: string; productionUnit: number; safetyStock: number } {
  if (t.productType === "오일파스텔") return { unit: "개", productionUnit: 100, safetyStock: t.safetyStock ?? 150 };
  if (t.productType === "수채물감") return { unit: "개", productionUnit: 200, safetyStock: t.safetyStock ?? 200 };
  return { unit: "개", productionUnit: 150, safetyStock: t.safetyStock ?? 100 };
}

export const sampleItems: Item[] = seedItems.map((s, i) => {
  const d = defaultUnitFor(s);
  return {
    id: `I-${String(i + 1).padStart(4, "0")}`,
    itemNo: s.itemNo,
    productType: s.productType,
    colorName: s.colorName,
    colorCode: s.colorCode,
    scentName: s.scentName,
    scentCode: s.scentCode,
    status: s.status ?? "사용중",
    stock: s.stock,
    safetyStock: d.safetyStock,
    unit: d.unit,
    productionUnit: d.productionUnit,
    note: s.note,
  };
});

// ─── Item BOM ──────────────────────────────────────────────
// Per-piece (1개) consumption for each item. Pigment colorant + wax/oil/binder + fragrance + sleeve/case.
function bomFor(itemNo: string, ...lines: Omit<ItemBomLine, "id" | "itemNo">[]): ItemBomLine[] {
  return lines.map((l, i) => ({
    id: `B-${itemNo}-${String(i + 1).padStart(2, "0")}`,
    itemNo,
    ...l,
  }));
}

// Helper to look up category by name (lightweight; the BOM editor lets you change later)
const matMap = Object.fromEntries(sampleMaterials.map((m) => [m.id, m]));
function mat(id: string, amount: number, note = ""): Omit<ItemBomLine, "id" | "itemNo"> {
  const m = matMap[id];
  return {
    materialId: id,
    materialName: m.name,
    materialCategory: m.category,
    amountPerUnit: amount,
    unit: m.unit,
    note,
  };
}

// Oil pastel baseline: 0.8g pigment, 2.1g 비즈, 1.2g 소이, 0.4ml 코코넛 오일, 0.05ml fragrance, 1 sleeve
const opBase = (pigmentId: string, scentId = "M-101") => [
  mat(pigmentId, 0.8),
  mat("M-201", 2.1),
  mat("M-202", 1.2),
  mat("M-203", 0.4),
  mat(scentId, 0.05),
  mat("M-301", 1),
];
const opMix = (p1: string, a1: number, p2: string, a2: number, scentId = "M-101") => [
  mat(p1, a1),
  mat(p2, a2),
  mat("M-201", 2.1),
  mat("M-202", 1.2),
  mat("M-203", 0.4),
  mat(scentId, 0.05),
  mat("M-301", 1),
];

// Watercolor: 0.4g pigment, 0.6g 아라비아 검, 0.1ml 글리세린, 0.02ml fragrance, 1 tube
const wcBase = (pigmentId: string, scentId = "M-101") => [
  mat(pigmentId, 0.4),
  mat("M-204", 0.6),
  mat("M-205", 0.1),
  mat(scentId, 0.02),
  mat("M-302", 1),
];
const wcMix = (p1: string, a1: number, p2: string, a2: number, scentId = "M-101") => [
  mat(p1, a1),
  mat(p2, a2),
  mat("M-204", 0.6),
  mat("M-205", 0.1),
  mat(scentId, 0.02),
  mat("M-302", 1),
];

// Solid paint (고체): 0.5g pigment, 0.5g 아라비아 검, 0.2ml 글리세린, 0.02ml fragrance, 1 pan
const spBase = (pigmentId: string, scentId = "M-104") => [
  mat(pigmentId, 0.5),
  mat("M-204", 0.5),
  mat("M-205", 0.2),
  mat(scentId, 0.02),
  mat("M-303", 1),
];
const spMix = (p1: string, a1: number, p2: string, a2: number, scentId = "M-104") => [
  mat(p1, a1),
  mat(p2, a2),
  mat("M-204", 0.5),
  mat("M-205", 0.2),
  mat(scentId, 0.02),
  mat("M-303", 1),
];

export const sampleItemBom: ItemBomLine[] = [
  // 오일파스텔 거베라 옵션
  ...bomFor("101", ...opBase("M-004")),                  // 레드
  ...bomFor("102", ...opBase("M-003")),                  // 옐로
  ...bomFor("103", ...opMix("M-003", 0.5, "M-004", 0.3)),// 살구
  ...bomFor("104", ...opBase("M-005")),                  // 브라운 (번트시에나)
  ...bomFor("105", ...opMix("M-004", 0.5, "M-003", 0.3)),// 코랄
  ...bomFor("106", ...opBase("M-001")),                  // 화이트
  ...bomFor("107", ...opMix("M-004", 0.4, "M-001", 0.4)),// 핑크
  ...bomFor("108", ...opBase("M-007")),                  // 그린
  ...bomFor("109", ...opBase("M-006")),                  // 바이올렛
  ...bomFor("110", ...opBase("M-008")),                  // 블랙

  // 수채물감 플로럴 옵션
  ...bomFor("201", ...wcBase("M-004", "M-101")),
  ...bomFor("202", ...wcMix("M-004", 0.2, "M-001", 0.2, "M-101")),
  ...bomFor("203", ...wcBase("M-003", "M-102")),
  ...bomFor("204", ...wcMix("M-003", 0.25, "M-007", 0.15, "M-102")),
  ...bomFor("205", ...wcBase("M-002", "M-102")),
  ...bomFor("206", ...wcBase("M-006", "M-101")),
  ...bomFor("207", ...wcMix("M-005", 0.2, "M-001", 0.2, "M-101")),
  ...bomFor("208", ...wcBase("M-005", "M-103")),
  ...bomFor("209", ...wcBase("M-008", "M-103")),
  ...bomFor("210", ...wcBase("M-001", "M-103")),

  // 고체물감 과실 옵션
  ...bomFor("301", ...spBase("M-004", "M-104")),
  ...bomFor("302", ...spMix("M-004", 0.3, "M-003", 0.2, "M-104")),
  ...bomFor("303", ...spBase("M-003", "M-104")),
  ...bomFor("304", ...spMix("M-003", 0.3, "M-007", 0.2, "M-105")),
  ...bomFor("305", ...spMix("M-007", 0.3, "M-001", 0.2, "M-105")),
  ...bomFor("306", ...spBase("M-002", "M-104")),
  ...bomFor("307", ...spBase("M-006", "M-104")),
  ...bomFor("308", ...spMix("M-004", 0.25, "M-001", 0.25, "M-101")),
  ...bomFor("309", ...spBase("M-005", "M-105")),
  ...bomFor("310", ...spBase("M-001", "M-101")),
];

// ─── Set options ───────────────────────────────────────────
export const sampleSetOptions: SetOption[] = [
  { id: "SO-001", productType: "오일파스텔", setSize: "10색", optionName: "거베라", optionCode: "OP-10-GBR", isActive: true, note: "거베라 컬러팔레트 · 로즈향", salePrice: 0, commissionRate: 0 },
  { id: "SO-002", productType: "오일파스텔", setSize: "5색",  optionName: "거베라 미니", optionCode: "OP-5-GBR",  isActive: true, note: "5색 미니 키트", salePrice: 0, commissionRate: 0 },
  { id: "SO-003", productType: "수채물감", setSize: "10색", optionName: "플로럴", optionCode: "WC-10-FLR", isActive: true, note: "플로럴 컬러팔레트", salePrice: 0, commissionRate: 0 },
  { id: "SO-004", productType: "고체물감", setSize: "10색", optionName: "과실",   optionCode: "SP-10-FRT", isActive: true, note: "10팬 고체물감", salePrice: 0, commissionRate: 0 },
  { id: "SO-005", productType: "고체물감", setSize: "키트", optionName: "과실 디럭스", optionCode: "SP-KIT-FRT", isActive: true, note: "팬 + 붓 + 노트북", salePrice: 0, commissionRate: 0 },
];

// ─── Set composition (set ↔ item × qty) ────────────────────
const opGbr10 = ["101","102","103","104","105","106","107","108","109","110"];
const opGbr5  = ["101","102","106","108","110"];
const wc10    = ["201","202","203","204","205","206","207","208","209","210"];
const sp10    = ["301","302","303","304","305","306","307","308","309","310"];

function comp(setOptionId: string, items: string[], qtyEach = 1): SetComposition[] {
  return items.map((itemNo, i) => ({
    id: `SC-${setOptionId}-${String(i + 1).padStart(2, "0")}`,
    setOptionId,
    itemNo,
    order: i + 1,
    qty: qtyEach,
    note: "",
  }));
}

export const sampleSetComposition: SetComposition[] = [
  ...comp("SO-001", opGbr10),
  ...comp("SO-002", opGbr5),
  ...comp("SO-003", wc10),
  ...comp("SO-004", sp10),
  ...comp("SO-005", sp10),
];

// ─── Item production lots ──────────────────────────────────
export const sampleItemLots: ItemLot[] = [
  { id: "IL-001", date: "2026-05-18", itemNo: "102", productType: "오일파스텔", lotCode: "LOT-2605-102-01", targetQty: 200, completedQty: 130, defectQty: 4, assignee: "이도현", status: "진행중", note: "" },
  { id: "IL-002", date: "2026-05-17", itemNo: "210", productType: "수채물감",  lotCode: "LOT-2605-210-01", targetQty: 300, completedQty: 300, defectQty: 6, assignee: "박세나", status: "완료", note: "" },
  { id: "IL-003", date: "2026-05-20", itemNo: "110", productType: "오일파스텔", lotCode: "LOT-2605-110-01", targetQty: 200, completedQty: 0,   defectQty: 0, assignee: "최정아", status: "예정", note: "안전재고 미달 보충" },
  { id: "IL-004", date: "2026-05-16", itemNo: "310", productType: "고체물감",  lotCode: "LOT-2605-310-01", targetQty: 150, completedQty: 60,  defectQty: 2, assignee: "김루아", status: "보류", note: "팬 트레이 입고 대기" },
];

// ─── Set assembly lots ─────────────────────────────────────
export const sampleSetAssemblyLots: SetAssemblyLot[] = [
  { id: "SA-001", date: "2026-05-19", setOptionId: "SO-001", productType: "오일파스텔", setSize: "10색", optionName: "거베라", qty: 30,  assignee: "최정아", status: "완료", note: "" },
  { id: "SA-002", date: "2026-05-20", setOptionId: "SO-003", productType: "수채물감", setSize: "10색", optionName: "플로럴", qty: 50, assignee: "박세나", status: "예정", note: "" },
];

// ─── Finished set inventory ────────────────────────────────
export const sampleFinishedSets: FinishedSet[] = [
  { id: "FS-001", productType: "오일파스텔", setSize: "10색", optionName: "거베라", optionCode: "OP-10-GBR", stock: 45, reserved: 12, available: 33, location: "A-01", lastProducedAt: "2026-05-19" },
  { id: "FS-002", productType: "오일파스텔", setSize: "5색",  optionName: "거베라 미니", optionCode: "OP-5-GBR",  stock: 60, reserved: 10, available: 50, location: "A-02", lastProducedAt: "2026-05-10" },
  { id: "FS-003", productType: "수채물감", setSize: "10색", optionName: "플로럴", optionCode: "WC-10-FLR", stock: 70, reserved: 18, available: 52, location: "B-01", lastProducedAt: "2026-05-15" },
  { id: "FS-004", productType: "고체물감", setSize: "10색", optionName: "과실",   optionCode: "SP-10-FRT", stock: 28, reserved: 4,  available: 24, location: "C-01", lastProducedAt: "2026-04-22" },
];

// ─── Shipments ─────────────────────────────────────────────
export const sampleShipments: Shipment[] = [
  { id: "SH-001", date: "2026-05-19", productType: "오일파스텔", setSize: "10색", optionName: "거베라", optionCode: "OP-10-GBR", qty: 12, customer: "텐바이텐", assignee: "최정아", note: "" },
  { id: "SH-002", date: "2026-05-18", productType: "수채물감", setSize: "10색", optionName: "플로럴", optionCode: "WC-10-FLR", qty: 8,  customer: "29CM",    assignee: "박세나", note: "" },
  { id: "SH-003", date: "2026-05-17", productType: "고체물감", setSize: "10색", optionName: "과실",   optionCode: "SP-10-FRT", qty: 4,  customer: "오롤리데이", assignee: "김루아", note: "샘플 출고" },
];

// ─── Work logs ─────────────────────────────────────────────
export const sampleWorkLogs: WorkLog[] = [
  { id: "W-001", time: "2026-05-20T10:42:00", type: "품목 생산",   target: "102번 / 거베라 옐로",     change: "투입 시작 (목표 200개)", assignee: "이도현", note: "" },
  { id: "W-002", time: "2026-05-20T09:14:00", type: "원료 입고",   target: "라벤더 에센셜 오일",      change: "+500ml",                 assignee: "이도현", note: "Aromatic Lab" },
  { id: "W-003", time: "2026-05-19T16:05:00", type: "세트 조립",   target: "오일파스텔 10색 거베라",  change: "조립 30세트",             assignee: "최정아", note: "" },
  { id: "W-004", time: "2026-05-19T14:30:00", type: "세트 입고",   target: "오일파스텔 10색 거베라",  change: "+30세트",                 assignee: "최정아", note: "A-01 보관" },
  { id: "W-005", time: "2026-05-19T11:22:00", type: "품목 입고",   target: "210번 / 플로럴 화이트",   change: "+300개",                  assignee: "박세나", note: "" },
  { id: "W-006", time: "2026-05-19T10:05:00", type: "출고",        target: "오일파스텔 10색 거베라",  change: "-12세트 (텐바이텐)",       assignee: "최정아", note: "" },
  { id: "W-007", time: "2026-05-18T17:48:00", type: "원가 수정",   target: "오일파스텔 1개 인건비",   change: "120원",                   assignee: "김루아", note: "5월 단가 반영" },
];

// ─── Cost items (항목명/금액/단위/적용기준/비고) ──────────
export const sampleCostItems: CostItem[] = [
  { id: "C-001", name: "오일파스텔 1개 인건비",      amount: 120,  unit: "원", basis: "품목 생산 1개당", note: "" },
  { id: "C-002", name: "수채물감 1개 인건비",        amount: 80,   unit: "원", basis: "품목 생산 1개당", note: "" },
  { id: "C-003", name: "고체물감 1개 인건비",        amount: 90,   unit: "원", basis: "품목 생산 1개당", note: "" },
  { id: "C-004", name: "오일파스텔 10색 조립비",     amount: 1500, unit: "원", basis: "세트 1조립당",     note: "박스+슬리브 정돈" },
  { id: "C-005", name: "오일파스텔 10색 패키지비",   amount: 1900, unit: "원", basis: "세트 1조립당",     note: "" },
  { id: "C-006", name: "수채물감 10색 조립비",       amount: 1200, unit: "원", basis: "세트 1조립당",     note: "" },
  { id: "C-007", name: "수채물감 10색 패키지비",     amount: 2100, unit: "원", basis: "세트 1조립당",     note: "" },
  { id: "C-008", name: "고체물감 10색 조립비",       amount: 1300, unit: "원", basis: "세트 1조립당",     note: "" },
  { id: "C-009", name: "고체물감 10색 패키지비",     amount: 2400, unit: "원", basis: "세트 1조립당",     note: "" },
  { id: "C-010", name: "B2B 수수료",                 amount: 18,   unit: "%",  basis: "세트 공급가",       note: "텐바이텐 기준" },
];

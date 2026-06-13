// ─── Storefront catalog ────────────────────────────────────
// The consumer-facing 자사몰 (PRODUCT site) and the separated wholesale
// member area both read from this single catalog. Products are derived from
// the real internal item / set-option master (data/sampleData.ts) so the shop
// stays in sync with what the brand actually manufactures.
//
// Pricing model:
//   • retailUsd    — global D2C retail price (USD), shown on the public store.
//   • wholesaleKrw — per-unit wholesale price (KRW), shown only to logged-in
//                    wholesale members on the separated /wholesale screen.
//   • moq          — wholesale minimum order quantity (units).
import { sampleItems, sampleSetOptions } from "./sampleData";
import type { ProductType } from "@/types";

export interface StoreColor {
  itemNo: string;
  name: string;
  hex: string;
  scent: string;
}

export type ProductKind = "set" | "refill";

export interface StoreProduct {
  slug: string;
  name: string; // English / global name
  nameKo: string; // Korean name
  productType: ProductType;
  kind: ProductKind;
  setSize: string;
  badge?: string;
  tagline: string;
  description: string;
  highlights: string[];
  scents: string[];
  colors: StoreColor[];
  retailUsd: number;
  wholesaleKrw: number;
  moq: number;
}

// Display hex per item number. Hand-tuned to the color names in the item
// master so swatches and gradient artwork read true to the physical product.
const HEX_BY_ITEM: Record<string, string> = {
  // 오일파스텔 거베라
  "101": "#D8442F", "102": "#F2C14E", "103": "#F2A65A", "104": "#8A5A36", "105": "#F2795B",
  "106": "#F5F1E8", "107": "#E89BB0", "108": "#6FA86B", "109": "#8A6FB0", "110": "#2B2A28",
  // 수채물감 플로럴
  "201": "#C8425C", "202": "#F4A98A", "203": "#F2D24E", "204": "#B5CE5A", "205": "#7FB6D8",
  "206": "#B79AD0", "207": "#E2CBA0", "208": "#9A6B4E", "209": "#4A4742", "210": "#F5F2EA",
  // 고체물감 과실
  "301": "#C22E3A", "302": "#EE7B30", "303": "#F4CB3F", "304": "#A7C957", "305": "#7FCBA8",
  "306": "#4A5FA0", "307": "#6E4A8E", "308": "#F4A88C", "309": "#5A3825", "310": "#EDE6D6",
};

function colorsFor(productType: ProductType, limit?: number): StoreColor[] {
  const list = sampleItems
    .filter((it) => it.productType === productType && it.status === "사용중")
    .map((it) => ({
      itemNo: it.itemNo,
      name: it.colorName,
      hex: HEX_BY_ITEM[it.itemNo] ?? "#C9C2B2",
      scent: it.scentName,
    }));
  return typeof limit === "number" ? list.slice(0, limit) : list;
}

function scentsFor(productType: ProductType): string[] {
  return Array.from(new Set(colorsFor(productType).map((c) => c.scent)));
}

const oilColors = colorsFor("오일파스텔");
const waterColors = colorsFor("수채물감");
const solidColors = colorsFor("고체물감");

// Primary SKUs — the sellable sets from the 세트옵션 master, enriched with
// global copy, pricing and the real color line-up.
export const STORE_PRODUCTS: StoreProduct[] = [
  {
    slug: "oil-pastel-gerbera-10",
    name: "Gerbera Scented Oil Pastels · 10 Colors",
    nameKo: "거베라 향 오일파스텔 10색 세트",
    productType: "오일파스텔",
    kind: "set",
    setSize: "10 colors",
    badge: "Best seller",
    tagline: "Rose-scented oil pastels in ten gerbera-bloom hues.",
    description:
      "A full ten-color palette of creamy, blendable oil pastels infused with a soft rose fragrance. Each stick is wrapped in a paper sleeve and laydown is rich enough for layering, scumbling and fine detail alike.",
    highlights: [
      "10 highly-pigmented gerbera tones",
      "Subtle rose fragrance, skin-safe binders",
      "Smooth, buttery laydown for blending",
      "Recyclable paper sleeves",
    ],
    scents: scentsFor("오일파스텔"),
    colors: oilColors,
    retailUsd: 42,
    wholesaleKrw: 21000,
    moq: 20,
  },
  {
    slug: "oil-pastel-gerbera-5-mini",
    name: "Gerbera Mini Oil Pastels · 5 Colors",
    nameKo: "거베라 미니 오일파스텔 5색 키트",
    productType: "오일파스텔",
    kind: "set",
    setSize: "5 colors",
    tagline: "A travel-size rose-scented starter kit.",
    description:
      "The five most-loved gerbera shades in a slim travel tin — the perfect introduction to scented oil pastels, sized for sketchbooks and on-the-go color.",
    highlights: [
      "5 core gerbera colors",
      "Compact travel format",
      "Rose fragrance",
    ],
    scents: scentsFor("오일파스텔"),
    colors: oilColors.slice(0, 5),
    retailUsd: 24,
    wholesaleKrw: 12000,
    moq: 30,
  },
  {
    slug: "watercolor-floral-10",
    name: "Floral Scented Watercolors · 10 Tubes",
    nameKo: "플로럴 향 수채물감 10색 세트",
    productType: "수채물감",
    kind: "set",
    setSize: "10 tubes",
    badge: "New",
    tagline: "Lightfast watercolors with a layered floral bouquet.",
    description:
      "Ten 5ml tubes of finely-milled watercolor, each scented to its own floral note — rose, freesia and lavender. Re-wettable, lightfast and ideal for botanical and landscape work.",
    highlights: [
      "10 lightfast floral tones",
      "5ml tubes, re-wettable",
      "Rose · freesia · lavender notes",
      "Single-pigment clarity",
    ],
    scents: scentsFor("수채물감"),
    colors: waterColors,
    retailUsd: 48,
    wholesaleKrw: 24000,
    moq: 20,
  },
  {
    slug: "solid-watercolor-fruit-10",
    name: "Fruit Scented Solid Watercolors · 10 Pans",
    nameKo: "과실 향 고체물감 10색 세트",
    productType: "고체물감",
    kind: "set",
    setSize: "10 pans",
    tagline: "Bergamot & cedar-scented pan paints in fruit colors.",
    description:
      "Ten ready-to-use solid watercolor pans in juicy fruit shades, scented with bergamot and cedar. Activates instantly with a wet brush — no mixing, no mess.",
    highlights: [
      "10 fruit-toned pans",
      "Instant wet-brush activation",
      "Bergamot · cedar fragrance",
      "Refillable tray",
    ],
    scents: scentsFor("고체물감"),
    colors: solidColors,
    retailUsd: 45,
    wholesaleKrw: 22500,
    moq: 20,
  },
  {
    slug: "solid-watercolor-fruit-deluxe",
    name: "Fruit Solid Watercolor Deluxe Kit",
    nameKo: "과실 고체물감 디럭스 키트",
    productType: "고체물감",
    kind: "set",
    setSize: "kit",
    badge: "Limited",
    tagline: "The 10-pan set plus brush and pocket sketchbook.",
    description:
      "Everything in the fruit-scented pan set, paired with a water brush and a pocket sketchbook in a gift-ready box. A complete, paint-anywhere kit.",
    highlights: [
      "10 fruit-toned pans",
      "Water brush included",
      "Pocket sketchbook included",
      "Gift-ready box",
    ],
    scents: scentsFor("고체물감"),
    colors: solidColors,
    retailUsd: 68,
    wholesaleKrw: 34000,
    moq: 12,
  },
  // Single-color refills — color chosen on the product page.
  {
    slug: "oil-pastel-single",
    name: "Oil Pastel · Single Refill",
    nameKo: "오일파스텔 낱개 리필",
    productType: "오일파스텔",
    kind: "refill",
    setSize: "1 stick",
    tagline: "Replace a favorite — pick any gerbera shade.",
    description:
      "A single rose-scented oil pastel stick. Choose any color from the gerbera line to top up your set.",
    highlights: ["Choose any gerbera color", "Rose fragrance", "Paper sleeve"],
    scents: scentsFor("오일파스텔"),
    colors: oilColors,
    retailUsd: 5,
    wholesaleKrw: 2500,
    moq: 50,
  },
  {
    slug: "watercolor-single",
    name: "Watercolor Tube · Single Refill",
    nameKo: "수채물감 낱개 리필",
    productType: "수채물감",
    kind: "refill",
    setSize: "1 tube (5ml)",
    tagline: "Top up any floral watercolor tube.",
    description:
      "A single 5ml floral-scented watercolor tube. Choose any color from the floral line.",
    highlights: ["Choose any floral color", "5ml tube", "Lightfast"],
    scents: scentsFor("수채물감"),
    colors: waterColors,
    retailUsd: 6,
    wholesaleKrw: 3000,
    moq: 40,
  },
  {
    slug: "solid-watercolor-single",
    name: "Solid Watercolor Pan · Single Refill",
    nameKo: "고체물감 낱개 리필",
    productType: "고체물감",
    kind: "refill",
    setSize: "1 pan",
    tagline: "Refill a single fruit-scented pan.",
    description:
      "A single fruit-scented solid watercolor pan. Choose any color from the fruit line.",
    highlights: ["Choose any fruit color", "Wet-brush ready", "Fits the refillable tray"],
    scents: scentsFor("고체물감"),
    colors: solidColors,
    retailUsd: 5.5,
    wholesaleKrw: 2750,
    moq: 40,
  },
];

export const PRODUCT_TYPE_LABELS: Record<ProductType, { en: string; ko: string }> = {
  오일파스텔: { en: "Oil Pastels", ko: "오일파스텔" },
  수채물감: { en: "Watercolors", ko: "수채물감" },
  고체물감: { en: "Solid Watercolors", ko: "고체물감" },
};

export function getProduct(slug: string): StoreProduct | undefined {
  return STORE_PRODUCTS.find((p) => p.slug === slug);
}

export function productGradient(p: StoreProduct): string {
  const stops = p.colors.slice(0, 5).map((c) => c.hex);
  if (stops.length < 2) stops.push("#E6DDC4");
  return `linear-gradient(135deg, ${stops.join(", ")})`;
}

// Wholesale member directory (demo). In production this would be a real member
// table; here a small allow-list backs the separated wholesale login.
export interface WholesaleAccount {
  code: string;
  company: string;
  tier: "Standard" | "Gold";
  discountNote: string;
}

export const WHOLESALE_ACCOUNTS: WholesaleAccount[] = [
  { code: "BFTER-WS-01", company: "Atelier Supply Co.", tier: "Gold", discountNote: "Gold tier · net-30 terms" },
  { code: "BFTER-WS-02", company: "Hue & Co. Distribution", tier: "Standard", discountNote: "Standard tier" },
  { code: "DEMO-2026", company: "Demo Wholesale Partner", tier: "Standard", discountNote: "Demo access" },
];

export function findWholesaleAccount(code: string): WholesaleAccount | undefined {
  const norm = code.trim().toUpperCase();
  return WHOLESALE_ACCOUNTS.find((a) => a.code.toUpperCase() === norm);
}

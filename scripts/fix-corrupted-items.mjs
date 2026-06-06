// Restore items 101 and 102 Korean fields after PowerShell write-test corruption.
// Run: node scripts/fix-item-101.mjs
const BASE = process.env.BFTER_BASE || "https://bfter.vercel.app";
const PW = process.env.APP_PASSWORD || "anotherday123";

// Canonical sample data (from data/sampleData.ts) — only fields we need to overwrite.
const TARGETS = [
  { itemNo: "101", productType: "오일파스텔", colorName: "거베라 레드",   colorCode: "OP-R-01", scentName: "로즈", scentCode: "S-ROSE", status: "사용중", safetyStock: 150, unit: "개", productionUnit: 100 },
  { itemNo: "102", productType: "오일파스텔", colorName: "거베라 옐로",   colorCode: "OP-Y-01", scentName: "로즈", scentCode: "S-ROSE", status: "사용중", safetyStock: 150, unit: "개", productionUnit: 100 },
];

const jar = new Map();
function cookieHeader() {
  return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
}
function storeSetCookies(headers) {
  for (const [k, v] of headers.entries()) {
    if (k.toLowerCase() !== "set-cookie") continue;
    const semi = v.indexOf(";");
    const kv = semi >= 0 ? v.slice(0, semi) : v;
    const eq = kv.indexOf("=");
    if (eq > 0) jar.set(kv.slice(0, eq), kv.slice(eq + 1));
  }
}

async function login() {
  const res = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password: PW, role: "관리자" }),
  });
  storeSetCookies(res.headers);
  if (!res.ok) { console.error("login failed:", await res.text()); process.exit(1); }
}

async function listItems() {
  const r = await fetch(`${BASE}/api/items`, { headers: { Cookie: cookieHeader() } });
  return (await r.json()).data;
}

async function patch(body) {
  const r = await fetch(`${BASE}/api/items`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader() },
    body: JSON.stringify(body),
  });
  return r.json();
}

await login();
const items = await listItems();
for (const t of TARGETS) {
  const current = items.find((x) => String(x.itemNo) === t.itemNo);
  if (!current) { console.warn("skip", t.itemNo, "not found"); continue; }
  const merged = { ...current, ...t, note: current.note || "" };
  console.log(`PATCH ${t.itemNo}: ${t.colorName} (preserving stock=${current.stock})`);
  const res = await patch(merged);
  console.log("  →", JSON.stringify(res.data?.colorName ?? res, null, 0));
}
console.log("\nFinal state:");
const after = await listItems();
for (const t of TARGETS) {
  const it = after.find((x) => String(x.itemNo) === t.itemNo);
  console.log(`  ${t.itemNo}: productType=${JSON.stringify(it?.productType)} colorName=${JSON.stringify(it?.colorName)}`);
}

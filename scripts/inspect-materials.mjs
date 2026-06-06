// Inspect what the materials API actually returns from the live sheet.
const BASE = process.env.BFTER_BASE || "https://bfter.vercel.app";
const PW = process.env.APP_PASSWORD || "anotherday123";

const jar = new Map();
function cookieHeader() {
  return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
}
function storeSetCookies(h) {
  for (const [k, v] of h.entries()) {
    if (k.toLowerCase() !== "set-cookie") continue;
    const semi = v.indexOf(";");
    const kv = semi >= 0 ? v.slice(0, semi) : v;
    const eq = kv.indexOf("=");
    if (eq > 0) jar.set(kv.slice(0, eq), kv.slice(eq + 1));
  }
}

const lr = await fetch(`${BASE}/api/auth/login`, {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ password: PW, role: "관리자" }),
});
storeSetCookies(lr.headers);

const r = await fetch(`${BASE}/api/materials`, { headers: { Cookie: cookieHeader() } });
const j = await r.json();
console.log("materials count:", j.data?.length ?? 0);
console.log("first 3 materials (raw):");
console.log(JSON.stringify(j.data?.slice(0, 3) ?? [], null, 2));
console.log("\ndistinct keys across rows:");
const keys = new Set();
for (const m of j.data ?? []) for (const k of Object.keys(m)) keys.add(k);
console.log("  " + Array.from(keys).join(", "));

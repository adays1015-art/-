import { NextResponse } from "next/server";
import { defByKey, defByTabName } from "@/services/csvSync";
import { parseCsv, serializeCsv } from "@/lib/csv";
import { requireRole } from "@/lib/apiAuth";

function resolveDef(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const tab = url.searchParams.get("tab");
  if (key) return defByKey(key);
  if (tab) return defByTabName(tab);
  return null;
}

/**
 * GET /api/sync/csv?key=items
 * Returns CSV with UTF-8 BOM, filename = <tabName>.csv
 */
export async function GET(req: Request) {
  const def = resolveDef(req);
  if (!def) return NextResponse.json({ error: "Unknown tab" }, { status: 400 });
  const rows = def.read().map((r) => def.toRow(r));
  const csv = serializeCsv(def.headers, rows);

  const filename = `${def.tabName}.csv`;
  // RFC 5987 filename* for Korean
  const encoded = encodeURIComponent(filename).replace(/'/g, "%27");
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${def.key}.csv"; filename*=UTF-8''${encoded}`,
      "Cache-Control": "no-store",
    },
  });
}

/**
 * POST /api/sync/csv?key=items
 * Body: raw CSV (text/csv) OR JSON { csv: string }.
 * Replaces the in-memory rows for that tab.
 */
export async function POST(req: Request) {
  const gate = requireRole("settings");
  if (!gate.ok) return gate.res;
  const def = resolveDef(req);
  if (!def) return NextResponse.json({ error: "Unknown tab" }, { status: 400 });

  const ct = req.headers.get("content-type") ?? "";
  let csvText = "";
  if (ct.includes("application/json")) {
    const body = await req.json();
    csvText = String(body.csv ?? "");
  } else {
    csvText = await req.text();
  }
  if (!csvText.trim()) {
    return NextResponse.json({ error: "Empty CSV body" }, { status: 400 });
  }

  const { headers: csvHeaders, rows } = parseCsv(csvText);
  const expected = def.headers;
  const missingHeaders = expected.filter((h) => !csvHeaders.includes(h));
  const extraHeaders = csvHeaders.filter((h) => !expected.includes(h));

  // Parse strictly by column name (order doesn't matter); missing columns default in fromRow.
  const parsed = rows.map((r) => def.fromRow(r));
  def.replace(parsed);

  return NextResponse.json({
    ok: true,
    key: def.key,
    tabName: def.tabName,
    imported: parsed.length,
    missingHeaders,
    extraHeaders,
  });
}

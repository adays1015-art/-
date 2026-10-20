import { NextResponse } from "next/server";
import { InputError, addRemnant, listRemnants } from "@/lib/store";
import type { RemnantStatus } from "@/lib/types";

const MAX_PHOTO_CHARS = 3_000_000; // 축소 JPEG 기준 충분한 여유

// GET /api/remnants?status=available&material=SS275&thickness=12&q=A-03
export function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const rows = listRemnants({
    status: (sp.get("status") as RemnantStatus | "all" | null) ?? "all",
    material: sp.get("material") ?? undefined,
    thickness: Number(sp.get("thickness")) || undefined,
    q: sp.get("q") ?? undefined,
  });
  return NextResponse.json({ count: rows.length, items: rows.slice(0, 500).map(({ photo, ...r }) => ({ ...r, hasPhoto: !!photo })) });
}

// POST /api/remnants — 작업자 등록. outline은 mm 단위 [[x, y], …]
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const outline = Array.isArray(b.outline)
    ? (b.outline as unknown[]).filter((p): p is [number, number] =>
        Array.isArray(p) && p.length === 2 && p.every((v) => typeof v === "number" && Number.isFinite(v)))
    : [];
  const photo = typeof b.photo === "string" && b.photo.startsWith("data:image/") && b.photo.length < MAX_PHOTO_CHARS ? b.photo : null;
  try {
    const r = addRemnant({
      engravedId: String(b.engravedId ?? ""),
      material: String(b.material ?? ""),
      thicknessMm: Number(b.thicknessMm),
      outline,
      rack: String(b.rack ?? ""),
      photo,
    });
    return NextResponse.json({ id: r.id, engravedId: r.engravedId }, { status: 201 });
  } catch (e) {
    if (e instanceof InputError) return NextResponse.json({ error: e.message }, { status: 400 });
    throw e;
  }
}

import { NextResponse } from "next/server";
import { listRemnants } from "@/lib/store";
import type { RemnantStatus } from "@/lib/types";

// GET /api/remnants?status=available&material=SS275&thickness=12&q=A-03
export function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const rows = listRemnants({
    status: (sp.get("status") as RemnantStatus | "all" | null) ?? "all",
    material: sp.get("material") ?? undefined,
    thickness: Number(sp.get("thickness")) || undefined,
    q: sp.get("q") ?? undefined,
  });
  return NextResponse.json({ count: rows.length, items: rows.slice(0, 500) });
}

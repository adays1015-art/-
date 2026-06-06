/**
 * Smoke-test endpoint. If GET /api/ping returns the JSON below, the
 * deployment is routing API requests correctly. Useful when diagnosing
 * "404 on a new route" issues.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/ping",
    timestamp: new Date().toISOString(),
  });
}

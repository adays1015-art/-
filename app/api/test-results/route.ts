import { NextResponse } from "next/server";
import { createTestResult, deleteTestResult, listTestResults } from "@/services/testResults";
import { requireRole } from "@/lib/apiAuth";
import { withErrorHandling } from "@/lib/apiError";
import { SHEET_TABS } from "@/lib/googleSheets";

const TAB = SHEET_TABS.testResults;

export async function GET() {
  return withErrorHandling("test-results GET", TAB, async () =>
    NextResponse.json({ data: await listTestResults() }));
}

export async function POST(req: Request) {
  const gate = requireRole("test-results");
  if (!gate.ok) return gate.res;
  return withErrorHandling("test-results POST", TAB, async () => {
    const body = await req.json();
    const created = await createTestResult(body);
    return NextResponse.json({ data: created });
  });
}

export async function DELETE(req: Request) {
  const gate = requireRole("delete");
  if (!gate.ok) return gate.res;
  return withErrorHandling("test-results DELETE", TAB, async () => {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const ok = await deleteTestResult(id);
    return NextResponse.json({ ok });
  });
}

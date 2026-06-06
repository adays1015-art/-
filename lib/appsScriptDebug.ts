/**
 * Tiny in-memory tracker for the most recent Apps Script call.
 * Used by the settings debug panel.
 *
 * Process-local — restarts when the server restarts. On Vercel each lambda
 * instance has its own copy.
 */

export interface AppsScriptCallTrace {
  url: string;
  action: string;
  method: string;
  requestBody?: string;
  httpStatus?: number;
  responseBody?: string;
  ok: boolean;
  errorMessage?: string;
  at: string; // ISO timestamp
}

declare global {
  // eslint-disable-next-line no-var
  var __APPS_SCRIPT_LAST__: AppsScriptCallTrace | undefined;
}

export function recordTrace(t: AppsScriptCallTrace): void {
  globalThis.__APPS_SCRIPT_LAST__ = t;
  // Server-side console log so logs in Vercel show the full request/response
  // eslint-disable-next-line no-console
  console.log(`[apps-script ${t.method} ${t.action}] ok=${t.ok} status=${t.httpStatus ?? "-"} resp=${(t.responseBody ?? "").slice(0, 200)}`);
}

export function getLastTrace(): AppsScriptCallTrace | null {
  return globalThis.__APPS_SCRIPT_LAST__ ?? null;
}

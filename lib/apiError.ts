/**
 * Shared error envelope for write API routes.
 *
 * Every write handler should wrap its body in `withErrorHandling(handler, tag)`
 * — that way:
 *   - AppsScriptCallError detail is surfaced to the client (sheetName, action,
 *     request body, response body) so the UI can render it.
 *   - All other errors get a consistent { error: string } shape.
 *   - Server logs include a tag so you can see in Vercel logs which route blew up.
 */
import { NextResponse } from "next/server";
import { AppsScriptCallError } from "./appsScript";

export interface ErrorPayload {
  error: string;
  appsScript?: {
    url: string;
    action: string;
    method: string;
    requestBody?: string;
    httpStatus?: number;
    responseBody?: string;
    errorMessage: string;
  };
  // Sheet tab the handler was trying to write to (set by the handler when known)
  sheetName?: string;
}

export function errorPayload(err: unknown, sheetName?: string): ErrorPayload {
  if (err instanceof AppsScriptCallError) {
    return {
      error: err.detail.errorMessage,
      sheetName,
      appsScript: {
        url: err.detail.url,
        action: err.detail.action,
        method: err.detail.method,
        requestBody: err.detail.requestBody,
        httpStatus: err.detail.httpStatus,
        responseBody: err.detail.responseBody,
        errorMessage: err.detail.errorMessage,
      },
    };
  }
  return { error: (err as Error).message || String(err), sheetName };
}

/**
 * Wrap a route handler body. The handler can throw — the wrapper catches and
 * returns a NextResponse with HTTP 500 + structured payload.
 *
 *   export async function PATCH(req: Request) {
 *     return withErrorHandling("items PATCH", "품목마스터", async () => {
 *       …  // throw on failure, return a value on success
 *       return NextResponse.json({ data: updated });
 *     });
 *   }
 */
export async function withErrorHandling(
  tag: string,
  sheetName: string | undefined,
  fn: () => Promise<Response>,
): Promise<Response> {
  try {
    return await fn();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[${tag}]`, err);
    return NextResponse.json(errorPayload(err, sheetName), { status: 500 });
  }
}

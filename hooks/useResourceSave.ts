"use client";

import { useCallback, useRef, useState } from "react";
import type { SaveErrorDetail } from "@/components/SaveErrorPanel";
import {
  begin as trackerBegin,
  end as trackerEnd,
  recordError as trackerRecordError,
  recordSuccess as trackerRecordSuccess,
  clearError as trackerClearError,
} from "@/lib/saveTracker";

/**
 * One shared save+error helper used by every editable page.
 *
 *   const { save, saving, error, clearError, retry } =
 *     useResourceSave("/api/items");
 *   const ok = await save("PATCH", body);          // POST also supported
 *
 * Each save is registered with the saveTracker so the GlobalSavingIndicator
 * can render a pill. On failure the structured AppsScriptCallError detail
 * (sheetName, action, request body, response body) is surfaced, AND the call
 * is memoized so a later `retry()` re-runs exactly the same request.
 *
 * Pages own optimistic state: apply the change locally before awaiting
 * `save(...)`, and roll back if `ok` is false. This hook doesn't try to
 * model that — it stays a thin wrapper around fetch.
 */
export type SaveMethod = "POST" | "PATCH" | "DELETE";
// `warning` is the server's optional top-level warning string (e.g. when a
// LOT saved but the deduction was skipped). Diagnostic — callers SHOULD
// surface it so silent skip-paths are visible.
export type SaveResult<T> = { ok: true; data: T; warning?: string } | { ok: false };

interface LastCall {
  method: SaveMethod;
  body: unknown;
  extraQuery?: string;
}

export function useResourceSave(endpoint: string) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<SaveErrorDetail | null>(null);
  // Memoize the latest call so retry() can re-run it without the caller
  // needing to re-pass the original args.
  const lastCallRef = useRef<LastCall | null>(null);

  const save = useCallback(async function save<T = unknown>(
    method: SaveMethod,
    body?: unknown,
    extraQuery?: string,
  ): Promise<SaveResult<T>> {
    lastCallRef.current = { method, body, extraQuery };
    setSaving(true);
    setError(null);
    trackerBegin();
    const url = extraQuery ? `${endpoint}?${extraQuery}` : endpoint;
    const init: RequestInit = {
      method,
      headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    };
    try {
      const res = await fetch(url, init);
      let json: {
        data?: unknown; error?: string; warning?: string;
        appsScript?: SaveErrorDetail["appsScript"]; sheetName?: string;
      } = {};
      try { json = await res.json(); } catch { /* might be empty */ }
      if (!res.ok || json.error) {
        const detail: SaveErrorDetail = {
          message: json.error ?? `HTTP ${res.status}`,
          sheetName: json.sheetName,
          appsScript: json.appsScript,
        };
        setError(detail);
        trackerRecordError(endpoint, detail);
        return { ok: false };
      }
      // Success — clear any stale error and stamp the success timestamp so
      // the GlobalSavingIndicator can render the ✓ 저장됨 toast.
      trackerClearError(endpoint);
      trackerRecordSuccess(endpoint);
      return {
        ok: true,
        data: json.data as T,
        warning: typeof json.warning === "string" ? json.warning : undefined,
      };
    } catch (err) {
      const detail: SaveErrorDetail = { message: (err as Error).message };
      setError(detail);
      trackerRecordError(endpoint, detail);
      return { ok: false };
    } finally {
      setSaving(false);
      trackerEnd();
    }
  }, [endpoint]);

  const retry = useCallback(async function retry<T = unknown>(): Promise<SaveResult<T> | null> {
    const c = lastCallRef.current;
    if (!c) return null;
    return save<T>(c.method, c.body, c.extraQuery);
  }, [save]);

  const clearError = useCallback(() => {
    setError(null);
    trackerClearError(endpoint);
  }, [endpoint]);

  return { save, saving, error, clearError, retry };
}

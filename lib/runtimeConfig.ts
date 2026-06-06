/**
 * Runtime config — a tiny JSON file that lets operators paste settings
 * (currently just the Sheet ID) without restarting the server or editing
 * .env.local.
 *
 * File: ./.bfter-config.json  (gitignored)
 * Resolution order for sheetId: env > runtime config > undefined
 *
 * Note: works for local / single-instance deployments. On Vercel the FS is
 * read-only at runtime, so production must use real env vars.
 */

import { promises as fs } from "fs";
import path from "path";

const FILE = path.join(process.cwd(), ".bfter-config.json");

export type RuntimeConfig = {
  sheetId?: string;
  appsScriptUrl?: string;
  // When true, the app ignores any configured URL and stays in mock mode.
  // Useful for offline demos without forgetting the saved Apps Script URL.
  useMockOverride?: boolean;
  updatedAt?: string;
  updatedBy?: string;
};

let cache: RuntimeConfig | null = null;
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 2_000;

async function readFromDisk(): Promise<RuntimeConfig> {
  try {
    const raw = await fs.readFile(FILE, "utf8");
    return JSON.parse(raw) as RuntimeConfig;
  } catch {
    return {};
  }
}

export async function getRuntimeConfig(): Promise<RuntimeConfig> {
  const now = Date.now();
  if (cache && now - cacheLoadedAt < CACHE_TTL_MS) return cache;
  cache = await readFromDisk();
  cacheLoadedAt = now;
  return cache;
}

export async function setRuntimeConfig(patch: RuntimeConfig): Promise<RuntimeConfig> {
  const current = await readFromDisk();
  const next: RuntimeConfig = { ...current, ...patch, updatedAt: new Date().toISOString() };
  try {
    await fs.writeFile(FILE, JSON.stringify(next, null, 2), "utf8");
  } catch (err) {
    // Read-only filesystem (e.g. Vercel) — surface a useful error
    throw new Error(
      "런타임 설정 파일을 저장할 수 없습니다. Vercel/읽기 전용 환경이라면 환경 변수로 설정하세요. (" +
        String((err as Error).message) +
        ")",
    );
  }
  cache = next;
  cacheLoadedAt = Date.now();
  return next;
}

export async function getEffectiveSheetId(): Promise<string | undefined> {
  if (process.env.GOOGLE_SHEET_ID) return process.env.GOOGLE_SHEET_ID;
  const cfg = await getRuntimeConfig();
  return cfg.sheetId || undefined;
}

export async function getEffectiveAppsScriptUrl(): Promise<string | undefined> {
  const cfg = await getRuntimeConfig();
  // Mock override takes priority — stays in mock even if a URL is saved.
  if (cfg.useMockOverride) return undefined;
  if (process.env.APPS_SCRIPT_URL) return process.env.APPS_SCRIPT_URL.trim();
  return (cfg.appsScriptUrl || "").trim() || undefined;
}

/** Like getEffectiveAppsScriptUrl but ignores the mock override — for UI display. */
export async function getStoredAppsScriptUrl(): Promise<string | undefined> {
  if (process.env.APPS_SCRIPT_URL) return process.env.APPS_SCRIPT_URL.trim();
  const cfg = await getRuntimeConfig();
  return (cfg.appsScriptUrl || "").trim() || undefined;
}

export async function clearRuntimeConfigKey(key: keyof RuntimeConfig): Promise<void> {
  await setRuntimeConfig({ [key]: undefined } as RuntimeConfig);
}

export function getSheetIdSource(): "env" | "runtime" | "none" {
  if (process.env.GOOGLE_SHEET_ID) return "env";
  // Best-effort sync read for diagnostic display; falls back to none on failure.
  try {
    // We don't await here; this is only used in UI badges. Worst case is a brief
    // mislabel until the page rerenders.
    return cache?.sheetId ? "runtime" : "none";
  } catch {
    return "none";
  }
}

/**
 * Tiny client-side pub/sub for in-flight save operations.
 *
 * `useResourceSave` calls begin/end around each network round-trip so the
 * GlobalSavingIndicator can render a small pill while anything is pending.
 *
 * Last-error state is keyed by endpoint so multiple pages can fail
 * independently without clobbering each other in the indicator.
 */

import type { SaveErrorDetail } from "@/components/SaveErrorPanel";

export interface SaveTrackerState {
  pending: number;            // total in-flight count across the app
  lastError: SaveErrorDetail | null;
  lastErrorEndpoint: string | null;
  lastErrorAt: number;
  // Timestamp of the most recent successful save (any endpoint). The global
  // indicator shows a brief ✓ 저장됨 toast based on this.
  lastSuccessAt: number;
  lastSuccessEndpoint: string | null;
}

type Listener = (s: SaveTrackerState) => void;

const state: SaveTrackerState = {
  pending: 0,
  lastError: null,
  lastErrorEndpoint: null,
  lastErrorAt: 0,
  lastSuccessAt: 0,
  lastSuccessEndpoint: null,
};
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => l(state));
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  l(state);
  return () => { listeners.delete(l); };
}

export function getState(): SaveTrackerState {
  return state;
}

export function begin(): void {
  state.pending += 1;
  notify();
}

export function end(): void {
  state.pending = Math.max(0, state.pending - 1);
  notify();
}

export function recordError(endpoint: string, detail: SaveErrorDetail): void {
  state.lastError = detail;
  state.lastErrorEndpoint = endpoint;
  state.lastErrorAt = Date.now();
  notify();
}

export function recordSuccess(endpoint: string): void {
  state.lastSuccessAt = Date.now();
  state.lastSuccessEndpoint = endpoint;
  notify();
}

export function clearError(endpoint?: string): void {
  if (endpoint && state.lastErrorEndpoint !== endpoint) return;
  state.lastError = null;
  state.lastErrorEndpoint = null;
  notify();
}

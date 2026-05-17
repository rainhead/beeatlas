// Phase 81 — module-level fetch singleton for /data/seasonality.json
// (Pitfall #81-B mitigation). Cache lifetime = page lifetime; one fetch
// per page load. Errors degrade gracefully to null (cards stay
// un-muted, filteredCount = occurrence_count fallback).

import { resolveDataUrl } from '../manifest.ts';

let promise: Promise<Record<string, Record<string, number[]>> | null> | null = null;

export function loadSeasonality(): Promise<Record<string, Record<string, number[]>> | null> {
  if (!promise) {
    promise = resolveDataUrl('seasonality')
      .then(url => fetch(url))
      .then(r => r.ok ? r.json() : null)
      .catch((err: unknown) => {
        console.warn('seasonality.json fetch failed', err);
        return null;
      });
  }
  return promise;
}

// Named one-shot readiness barriers for the app's independent async resources.
//
// The map-init path loads several heavy resources on independent timelines
// (Mapbox style, wa-sqlite tables, the taxon cache). Consumers that fire before
// a dependency is ready are the root of a recurring class of races (e.g. the
// legacy-taxon URL strand). This module gives each resource ONE awaitable
// promise so a consumer can `await` it instead of polling/guessing.
//
// Convention: consumers `await` the promise; the module that owns the resource
// calls the matching `mark*()` once it completes (idempotent — Promise resolve
// is a no-op after the first call). `tablesReady` is owned by sqlite.ts and
// re-exported here so all readiness lives in one place; its import sites are
// unchanged.
//
// NOTE (step 1 of 3): this is additive scaffolding. Nothing awaits taxaReady /
// mapReady yet — converting consumers to await them is a later change.

export { tablesReady } from './sqlite.ts';

export interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

/** A promise plus its resolve/reject handles — the standard one-shot barrier. */
export function deferred<T = void>(): Deferred<T> {
  let resolve!: Deferred<T>['resolve'];
  let reject!: Deferred<T>['reject'];
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const _taxaReady = deferred<void>();
const _mapReady = deferred<void>();

/** Resolves once the taxon cache (`bee-atlas._taxonCache`) is populated. */
export const taxaReady: Promise<void> = _taxaReady.promise;

/** Resolves once the Mapbox map's `'load'` event has fired. */
export const mapReady: Promise<void> = _mapReady.promise;

/** Owner-only: called by `bee-atlas` once the taxon cache is built. Idempotent. */
export function markTaxaReady(): void {
  _taxaReady.resolve();
}

/** Owner-only: called by `bee-map` on the map `'load'` event. Idempotent. */
export function markMapReady(): void {
  _mapReady.resolve();
}

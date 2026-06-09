import { test, expect, describe, vi } from 'vitest';

// ready.ts re-exports tablesReady from sqlite.ts, which has worker/WASM-flavored
// module internals; mock it so importing ready.ts is light in happy-dom.
vi.mock('../sqlite.ts', () => ({ tablesReady: Promise.resolve() }));

import { deferred } from '../ready.ts';

describe('ready.ts readiness primitives', () => {
  test('deferred() exposes a pending promise resolved via resolve()', async () => {
    const d = deferred<number>();
    let settled = false;
    void d.promise.then(() => { settled = true; });
    expect(settled).toBe(false); // still pending before resolve()
    d.resolve(42);
    await expect(d.promise).resolves.toBe(42);
  });

  test('deferred() rejects via reject()', async () => {
    const d = deferred<void>();
    d.reject(new Error('boom'));
    await expect(d.promise).rejects.toThrow('boom');
  });

  test('exports tablesReady / taxaReady / mapReady as promises and mark* as functions', async () => {
    const mod = await import('../ready.ts');
    expect(mod.tablesReady).toBeInstanceOf(Promise);
    expect(mod.taxaReady).toBeInstanceOf(Promise);
    expect(mod.mapReady).toBeInstanceOf(Promise);
    expect(typeof mod.markTaxaReady).toBe('function');
    expect(typeof mod.markMapReady).toBe('function');
  });

  test('markTaxaReady() and markMapReady() resolve their barriers (idempotently)', async () => {
    const { taxaReady, mapReady, markTaxaReady, markMapReady } = await import('../ready.ts');
    markTaxaReady();
    markTaxaReady(); // idempotent — must not throw
    markMapReady();
    await expect(taxaReady).resolves.toBeUndefined();
    await expect(mapReady).resolves.toBeUndefined();
  });
});

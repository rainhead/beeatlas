// beeatlas-vddd — a cached manifest can name a database the server has pruned.
// resolveDataUrl reads the manifest cache-first; `{ reload: true }` must go to the
// network, replace the cached copy, and replace the memoized one, so the retry the
// SQLite worker makes asks for the database that exists now.
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

const STALE = { occurrences_db: 'occurrences-000000000000.db', generated_at: '2026-10-01T00:00:00Z' };
const FRESH = { occurrences_db: 'occurrences-111111111111.db', generated_at: '2026-10-28T00:00:00Z' };

function stubCaches(initial: object) {
  let cached: object = initial;
  const put = vi.fn(async (_url: string, r: Response) => { cached = await r.json(); });
  vi.stubGlobal('caches', {
    match: vi.fn(async () => new Response(JSON.stringify(cached))),
    open: vi.fn(async () => ({ put })),
  });
  return { put, cached: () => cached };
}

describe('resolveDataUrl', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers(); // the deferred revalidation must not run during the test
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test('reads the cached manifest by default', async () => {
    stubCaches(STALE);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { resolveDataUrl } = await import('../manifest.ts');

    expect(await resolveDataUrl('occurrences_db')).toMatch(/\/occurrences-000000000000\.db$/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('{ reload: true } fetches the manifest and replaces both copies', async () => {
    const store = stubCaches(STALE);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(FRESH))));
    const { resolveDataUrl } = await import('../manifest.ts');

    expect(await resolveDataUrl('occurrences_db')).toMatch(/000000000000/);
    expect(await resolveDataUrl('occurrences_db', { reload: true })).toMatch(/\/occurrences-111111111111\.db$/);
    expect(store.cached()).toEqual(FRESH);
    // Later calls in this realm see the fresh manifest, not the memoized stale one.
    expect(await resolveDataUrl('occurrences_db')).toMatch(/111111111111/);
  });

  test('a failed reload is not memoized', async () => {
    stubCaches(STALE);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    const { resolveDataUrl } = await import('../manifest.ts');

    await expect(resolveDataUrl('occurrences_db', { reload: true })).rejects.toThrow(/503/);
    expect(await resolveDataUrl('occurrences_db')).toMatch(/000000000000/);
  });
});

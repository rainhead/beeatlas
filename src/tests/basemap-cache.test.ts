// beeatlas-6rs. The basemap manifest is the one thing that must survive going
// offline before anything else can: the archive filenames are date-stamped, so
// without it there is no source URL to name, and a fully primed 288 MB archive
// sitting in Cache Storage is unreachable.
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  loadBasemapManifest,
  BASEMAP_MANIFEST_CACHE,
} from '../basemap-cache.ts';
import { basemapManifestUrl, type BasemapManifest } from '../basemap-style.ts';

const MANIFEST: BasemapManifest = {
  regions: {
    wa: {
      archive: 'wa-20260801.pmtiles',
      bytes: 238283859,
      maxzoom: 14,
      attribution: '© OpenStreetMap contributors · Protomaps',
      terrain: {
        archive: 'wa-terrain-20260801.pmtiles',
        bytes: 64000000,
        maxzoom: 11,
        attribution: 'DEM: USGS 3DEP',
      },
    },
  },
};

/**
 * A Cache Storage stand-in. happy-dom ships no `caches`, and the real semantics
 * this code depends on are small: put(url, response) and match(url, {cacheName}).
 */
function installFakeCaches(): Map<string, Map<string, Response>> {
  const buckets = new Map<string, Map<string, Response>>();
  const bucket = (name: string) => {
    let b = buckets.get(name);
    if (!b) { b = new Map(); buckets.set(name, b); }
    return b;
  };
  vi.stubGlobal('caches', {
    open: async (name: string) => ({
      put: async (url: string, resp: Response) => { bucket(name).set(url, resp); },
    }),
    match: async (url: string, opts?: { cacheName?: string }) =>
      opts?.cacheName ? bucket(opts.cacheName).get(url) : undefined,
  });
  return buckets;
}

let buckets: Map<string, Map<string, Response>>;

beforeEach(() => { buckets = installFakeCaches(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

describe('the basemap manifest survives going offline', () => {
  test('a good fetch is returned AND primed into Cache Storage', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(MANIFEST)));

    const m = await loadBasemapManifest();
    expect(m?.regions.wa?.archive).toBe('wa-20260801.pmtiles');
    // Primed by us, not left to the service worker: a freshly installed PWA's
    // first load is uncontrolled, so the SW's passive routes never fire.
    expect(buckets.get(BASEMAP_MANIFEST_CACHE)?.has(basemapManifestUrl())).toBe(true);
  });

  test('the primed copy carries the terrain entry', async () => {
    // The confusing failure mode, not the obvious one: drop terrain from the
    // cached copy and the vector basemap still works offline while the hillshade
    // silently vanishes.
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(MANIFEST)));
    await loadBasemapManifest();

    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const offline = await loadBasemapManifest();
    expect(offline?.regions.wa?.terrain?.archive).toBe('wa-terrain-20260801.pmtiles');
  });

  test('offline falls back to the copy primed on an earlier load', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(MANIFEST)));
    await loadBasemapManifest();

    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    expect((await loadBasemapManifest())?.regions.wa?.archive).toBe('wa-20260801.pmtiles');
  });

  test('offline with nothing primed yields null, not a throw', async () => {
    // <bee-map> renders the blank style on null. A throw here would escape into
    // _initMapContent and cost the occurrence layers too.
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    expect(await loadBasemapManifest()).toBeNull();
  });

  test('a 404 does not poison the cache', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(MANIFEST)));
    await loadBasemapManifest();

    // The /basemap/tiles Alias goes missing on the server. The good copy from
    // before must still be what an offline load gets.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    expect((await loadBasemapManifest())?.regions.wa?.archive).toBe('wa-20260801.pmtiles');
  });

  test('an unparseable payload is never cached over a good one', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(MANIFEST)));
    await loadBasemapManifest();

    // A 200 with a body that cannot produce a style is the dangerous case: cached,
    // it would be served back on every subsequent offline load in place of the
    // good copy. Parsing happens before the put for exactly this reason.
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ regions: { wa: {} } })));
    expect((await loadBasemapManifest())?.regions.wa?.archive).toBe('wa-20260801.pmtiles');
  });

  test('the network is tried first, so a republished archive name is picked up', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(MANIFEST)));
    await loadBasemapManifest();

    const next = { regions: { wa: { ...MANIFEST.regions.wa, archive: 'wa-20261001.pmtiles' } } };
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(next)));
    // Cache-first would pin the client to an archive the publish has since
    // pruned — a broken basemap online, which is the case that matters most.
    expect((await loadBasemapManifest())?.regions.wa?.archive).toBe('wa-20261001.pmtiles');
  });
});

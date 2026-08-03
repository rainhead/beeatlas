// beeatlas-6rs. The basemap manifest is the one thing that must survive going
// offline before anything else can: the archive filenames are date-stamped, so
// without it there is no source URL to name, and a fully primed 288 MB archive
// sitting in Cache Storage is unreachable.
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  loadBasemapManifest,
  registerPrimedArchives,
  BlobSource,
  BASEMAP_MANIFEST_CACHE,
  BASEMAP_ARCHIVE_CACHE,
} from '../basemap-cache.ts';
import {
  basemapArchiveUrls,
  basemapManifestUrl,
  buildBasemapStyle,
  type BasemapManifest,
} from '../basemap-style.ts';

const ORIGIN = 'https://beeatlas.net';

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

// ---------------------------------------------------------------------------
// Reading a primed archive
// ---------------------------------------------------------------------------

describe('a primed archive is read locally instead of over the network', () => {
  /** A tiny stand-in for pmtiles' Protocol — only `add`, which is all we drive. */
  const fakeProtocol = () => {
    const tiles = new Map<string, { source: { getKey(): string } }>();
    return { tiles, add: (p: { source: { getKey(): string } }) => tiles.set(p.source.getKey(), p) };
  };

  const primeArchive = (url: string, bytes: Uint8Array) => {
    // The archives live in their own bucket, keyed by the URL the style names.
    let b = buckets.get(BASEMAP_ARCHIVE_CACHE);
    if (!b) { b = new Map(); buckets.set(BASEMAP_ARCHIVE_CACHE, b); }
    b.set(url, new Response(bytes.buffer as ArrayBuffer));
  };

  test('BlobSource reads exactly the requested range', async () => {
    // The read path in full. PMTiles asks for (offset, length); Blob.slice takes
    // (start, end), and getting that conversion wrong yields a byte short at every
    // read — which surfaces as a corrupt directory, not as an error.
    const bytes = new Uint8Array(Array.from({ length: 256 }, (_, i) => i));
    const src = new BlobSource('https://beeatlas.net/x.pmtiles', new Blob([bytes.buffer as ArrayBuffer]));

    const { data } = await src.getBytes(16, 4);
    expect([...new Uint8Array(data)]).toEqual([16, 17, 18, 19]);
    expect(src.getKey()).toBe('https://beeatlas.net/x.pmtiles');

    // Offset 0 and a length past the end — both happen for real: PMTiles opens
    // every archive with a 16 KB read that overruns a small file.
    expect((await src.getBytes(0, 3)).data.byteLength).toBe(3);
    expect((await src.getBytes(250, 16384)).data.byteLength).toBe(6);
  });

  test('the registered key is character-identical to what the style names', async () => {
    // THE SILENT FAILURE THIS PAIRING EXISTS TO PREVENT. Protocol dispatches by
    // exact string match on what follows `pmtiles://`. If the reader keys its
    // entry even slightly differently, nothing throws — Protocol just never
    // consults it and falls back to range requests over a network that, offline,
    // is not there. So assert against the STYLE, not against a literal.
    const style = buildBasemapStyle(MANIFEST, { origin: ORIGIN });
    const styleUrls = Object.values(style.sources)
      .map((s) => (s as { url?: string }).url)
      .filter((u): u is string => typeof u === 'string')
      .map((u) => u.replace(/^pmtiles:\/\//, ''))
      .sort();

    expect(basemapArchiveUrls(MANIFEST, { origin: ORIGIN }).sort()).toEqual(styleUrls);

    for (const url of styleUrls) primeArchive(url, new Uint8Array([1, 2, 3]));
    const protocol = fakeProtocol();
    await registerPrimedArchives(protocol as never, MANIFEST, { origin: ORIGIN });
    expect([...protocol.tiles.keys()].sort()).toEqual(styleUrls);
  });

  test('nothing primed registers nothing, leaving the network path intact', async () => {
    const protocol = fakeProtocol();
    expect(await registerPrimedArchives(protocol as never, MANIFEST, { origin: ORIGIN })).toBe(0);
    expect(protocol.tiles.size).toBe(0);
  });

  test('the vector archive can be primed while terrain is not', async () => {
    // The expected steady state on a device under storage pressure: terrain is
    // primed last and is the first thing to shed. It must degrade to a network
    // hillshade (or none), not break the vector basemap that IS local.
    const [vector] = basemapArchiveUrls(MANIFEST, { origin: ORIGIN });
    primeArchive(vector!, new Uint8Array([1, 2, 3]));

    const protocol = fakeProtocol();
    expect(await registerPrimedArchives(protocol as never, MANIFEST, { origin: ORIGIN })).toBe(1);
    expect([...protocol.tiles.keys()]).toEqual([vector]);
  });

  test('a manifest with no terrain entry asks for one archive, not two', async () => {
    const noTerrain: BasemapManifest = {
      regions: { wa: { ...MANIFEST.regions.wa!, terrain: undefined } },
    };
    expect(basemapArchiveUrls(noTerrain, { origin: ORIGIN })).toHaveLength(1);
  });

  test('an unreadable cache falls back to the network rather than losing the map', async () => {
    vi.stubGlobal('caches', {
      open: async () => { throw new Error('quota'); },
      match: async () => { throw new Error('bucket gone'); },
    });
    const protocol = fakeProtocol();
    expect(await registerPrimedArchives(protocol as never, MANIFEST, { origin: ORIGIN })).toBe(0);
  });
});

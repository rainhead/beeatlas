// beeatlas-6rs. The ~288 MB download and the rules around it. Two of these are
// correctness, not polish, and both come straight off the beeatlas-93t device
// spike: it must refuse outside an installed PWA (a browser tab is a SEPARATE
// storage bucket, so the bytes would be invisible to the installed app and
// unprotected against eviction), and a republish must REPLACE rather than
// accumulate.
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  computeBasemapState,
  isInstalledPWA,
  plannedArchives,
  primeBasemap,
  type BasemapOfflineState,
  type BasemapPrimeProgressDetail,
} from '../basemap-prime.ts';
import { BASEMAP_ARCHIVE_CACHE, BASEMAP_OFFLINE_FLAG } from '../basemap-cache.ts';
import type { BasemapManifest } from '../basemap-style.ts';

const ORIGIN = 'https://beeatlas.net';
const VECTOR = `${ORIGIN}/basemap/tiles/wa-20260801.pmtiles`;
const TERRAIN = `${ORIGIN}/basemap/tiles/wa-terrain-20260801.pmtiles`;

const MANIFEST: BasemapManifest = {
  regions: {
    wa: {
      archive: 'wa-20260801.pmtiles',
      bytes: 238_283_859,
      maxzoom: 14,
      attribution: '© OpenStreetMap contributors · Protomaps',
      terrain: {
        archive: 'wa-terrain-20260801.pmtiles',
        bytes: 64_000_000,
        maxzoom: 11,
        attribution: 'DEM: USGS 3DEP',
      },
    },
  },
};

let archives: Map<string, Response>;

/** Cache Storage stand-in with the delete/keys surface the prune path needs. */
function installFakeCaches(): void {
  archives = new Map();
  const api = {
    put: async (url: string, resp: Response) => { archives.set(url, resp); },
    keys: async () => [...archives.keys()].map((url) => ({ url })),
    delete: async (req: { url: string }) => archives.delete(req.url),
  };
  vi.stubGlobal('caches', {
    open: async () => api,
    // .clone(), because real Cache Storage hands out a fresh body every time and
    // this code reads the same entry more than once per prime. Without it the
    // second read sees a disturbed stream and reports the archive as absent.
    match: async (url: string, opts?: { cacheName?: string }) =>
      opts?.cacheName === BASEMAP_ARCHIVE_CACHE ? archives.get(url)?.clone() : undefined,
  });
}

function setInstalled(installed: boolean): void {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: installed })));
  Object.defineProperty(navigator, 'standalone', { value: installed, configurable: true });
}

/** A fetch that streams `bytes` in two chunks, as a real download would. */
function stubStreamingFetch(sizes: Record<string, number>): void {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const size = sizes[url];
    if (size === undefined) return new Response('nope', { status: 404 });
    const half = Math.floor(size / 2);
    return new Response(new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array(half));
        c.enqueue(new Uint8Array(size - half));
        c.close();
      },
    }));
  }));
}

beforeEach(() => {
  installFakeCaches();
  setInstalled(true);
  localStorage.clear();
  vi.stubGlobal('location', { origin: ORIGIN });
  Object.defineProperty(navigator, 'storage', {
    value: { persist: vi.fn(async () => true) }, configurable: true,
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('what gets downloaded, and in what order', () => {
  test('the vector archive comes first and terrain last', () => {
    // Not cosmetic. A style built from a manifest with no terrain entry is an
    // ordinary complete basemap, so terrain is the thing to shed under storage
    // pressure — and must never be why the vector basemap is missing.
    expect(plannedArchives(MANIFEST, { origin: ORIGIN }).map((a) => a.url))
      .toEqual([VECTOR, TERRAIN]);
  });

  test('a manifest with no terrain plans one archive', () => {
    const noTerrain: BasemapManifest = {
      regions: { wa: { ...MANIFEST.regions.wa!, terrain: undefined } },
    };
    expect(plannedArchives(noTerrain, { origin: ORIGIN }).map((a) => a.url)).toEqual([VECTOR]);
  });

  test('the total is both archives, ~288 MB and not ~227 MB', () => {
    const total = plannedArchives(MANIFEST, { origin: ORIGIN }).reduce((s, a) => s + a.bytes, 0);
    expect(total).toBe(238_283_859 + 64_000_000);
  });
});

describe('the download is refused outside an installed PWA', () => {
  test('a browser tab downloads nothing', async () => {
    // The spike proved the installed app has its OWN storage bucket: a marker
    // written in one context was invisible to the other, both directions. So 238 MB
    // fetched in a tab lands where the installed app will never read it — and
    // persist() is denied there, so it is not even protected.
    setInstalled(false);
    stubStreamingFetch({ [VECTOR]: 1000, [TERRAIN]: 500 });

    const state = await primeBasemap(MANIFEST, { origin: ORIGIN });
    expect(fetch).not.toHaveBeenCalled();
    expect(archives.size).toBe(0);
    expect(state.installed).toBe(false);
    expect(state.primed).toBe(false);
  });

  test('isInstalledPWA accepts either signal', () => {
    // display-mode is the standard one; navigator.standalone is iOS-only — and iOS
    // is the platform where this matters.
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
    Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });
    expect(isInstalledPWA()).toBe(true);

    Object.defineProperty(navigator, 'standalone', { value: undefined, configurable: true });
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    expect(isInstalledPWA()).toBe(true);

    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
    expect(isInstalledPWA()).toBe(false);
  });
});

describe('priming', () => {
  test('stores both archives and asks for persistent storage first', async () => {
    stubStreamingFetch({ [VECTOR]: 1000, [TERRAIN]: 500 });
    const state = await primeBasemap(MANIFEST, { origin: ORIGIN });

    expect([...archives.keys()]).toEqual([VECTOR, TERRAIN]);
    // Persistence governs eviction under storage PRESSURE, which is the actual
    // risk to a 288 MB cache — the 7-day ITP exemption is a different thing.
    expect(navigator.storage.persist).toHaveBeenCalled();
    expect(state.primed).toBe(true);
  });

  test('reports byte progress and ends idle', async () => {
    const seen: BasemapPrimeProgressDetail[] = [];
    const onProgress = (e: Event) => seen.push((e as CustomEvent<BasemapPrimeProgressDetail>).detail);
    window.addEventListener('basemap-prime-progress', onProgress);
    stubStreamingFetch({ [VECTOR]: 4_000_000, [TERRAIN]: 2_000_000 });

    await primeBasemap(MANIFEST, { origin: ORIGIN });
    window.removeEventListener('basemap-prime-progress', onProgress);

    expect(seen.length).toBeGreaterThan(0);
    expect(seen.at(-1)!.received).toBe(6_000_000);
    expect(seen.at(-1)!.archiveInFlight).toBeNull();
    // The denominator is reconciled from what actually arrived, so the bar cannot
    // stall short of 100% because the manifest's byte count was a rounded claim.
    expect(seen.at(-1)!.total).toBe(6_000_000);
  });

  test('an archive already present is skipped, so an interrupted run resumes', async () => {
    archives.set(VECTOR, new Response(new Uint8Array(1000).buffer));
    stubStreamingFetch({ [VECTOR]: 1000, [TERRAIN]: 500 });

    await primeBasemap(MANIFEST, { origin: ORIGIN });
    // 227 MB is not a thing to re-download because terrain failed last time.
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(TERRAIN);
  });

  test('a terrain failure still leaves a complete offline basemap', async () => {
    // Precisely why terrain is last: the hillshade degrades gracefully, so losing
    // it costs a garnish rather than the map.
    stubStreamingFetch({ [VECTOR]: 1000 }); // TERRAIN 404s
    await primeBasemap(MANIFEST, { origin: ORIGIN });

    expect([...archives.keys()]).toEqual([VECTOR]);
    const state = await computeBasemapState(MANIFEST, { origin: ORIGIN });
    expect(state.primed).toBe(false);
    expect(state.primedBytes).toBe(238_283_859);
  });

  test('concurrent calls collapse to one download', async () => {
    stubStreamingFetch({ [VECTOR]: 1000, [TERRAIN]: 500 });
    await Promise.all([
      primeBasemap(MANIFEST, { origin: ORIGIN }),
      primeBasemap(MANIFEST, { origin: ORIGIN }),
    ]);
    expect(fetch).toHaveBeenCalledTimes(2); // one per archive, not two per archive
  });
});

describe('a republished archive replaces rather than accumulates', () => {
  const NEXT: BasemapManifest = {
    regions: {
      wa: {
        ...MANIFEST.regions.wa!,
        archive: 'wa-20261101.pmtiles',
        terrain: { ...MANIFEST.regions.wa!.terrain!, archive: 'wa-terrain-20261101.pmtiles' },
      },
    },
  };
  const NEXT_VECTOR = `${ORIGIN}/basemap/tiles/wa-20261101.pmtiles`;
  const NEXT_TERRAIN = `${ORIGIN}/basemap/tiles/wa-terrain-20261101.pmtiles`;

  test('the superseded generation is evicted', async () => {
    stubStreamingFetch({ [VECTOR]: 1000, [TERRAIN]: 500 });
    await primeBasemap(MANIFEST, { origin: ORIGIN });

    stubStreamingFetch({ [NEXT_VECTOR]: 1100, [NEXT_TERRAIN]: 550 });
    await primeBasemap(NEXT, { origin: ORIGIN });

    // Quarterly republishes would otherwise pile up a gigabyte a year.
    expect([...archives.keys()].sort()).toEqual([NEXT_VECTOR, NEXT_TERRAIN].sort());
  });

  test('the old copy survives until the new one is safely stored', async () => {
    stubStreamingFetch({ [VECTOR]: 1000, [TERRAIN]: 500 });
    await primeBasemap(MANIFEST, { origin: ORIGIN });

    // The replacement download fails outright. Pruning first would have left the
    // device with no basemap at all — worse than a stale one.
    stubStreamingFetch({});
    await primeBasemap(NEXT, { origin: ORIGIN });
    expect(archives.has(VECTOR)).toBe(true);
  });

  test('a PARTIAL replacement evicts nothing', async () => {
    // The realistic version of the above, and the one an earlier cut got wrong:
    // the new vector archive lands, terrain 404s, and pruning "everything not in
    // the new manifest" would have deleted the complete previous generation in
    // favour of an incomplete new one. Nothing is evicted until there is
    // something whole to evict it in favour of.
    stubStreamingFetch({ [VECTOR]: 1000, [TERRAIN]: 500 });
    await primeBasemap(MANIFEST, { origin: ORIGIN });

    stubStreamingFetch({ [NEXT_VECTOR]: 1100 }); // NEXT_TERRAIN 404s
    await primeBasemap(NEXT, { origin: ORIGIN });

    expect(archives.has(TERRAIN)).toBe(true);
    expect(archives.has(VECTOR)).toBe(true);
    expect(archives.has(NEXT_VECTOR)).toBe(true);

    // …and it self-heals as soon as a complete set lands.
    stubStreamingFetch({ [NEXT_VECTOR]: 1100, [NEXT_TERRAIN]: 550 });
    await primeBasemap(NEXT, { origin: ORIGIN });
    expect([...archives.keys()].sort()).toEqual([NEXT_VECTOR, NEXT_TERRAIN].sort());
  });
});

describe('the kill switch', () => {
  test("'off' downloads nothing and reports nothing to offer", async () => {
    localStorage.setItem(BASEMAP_OFFLINE_FLAG, 'off');
    stubStreamingFetch({ [VECTOR]: 1000, [TERRAIN]: 500 });

    await primeBasemap(MANIFEST, { origin: ORIGIN });
    expect(fetch).not.toHaveBeenCalled();

    const state: BasemapOfflineState = await computeBasemapState(MANIFEST, { origin: ORIGIN });
    expect(state.available).toBe(false);
  });
});

describe('the state the account menu renders from', () => {
  test('no manifest means nothing to offer', async () => {
    expect((await computeBasemapState(null)).available).toBe(false);
  });

  test('a partial set reports the bytes already held, so the offer can say "resume"', async () => {
    archives.set(VECTOR, new Response(new Uint8Array(10).buffer));
    const state = await computeBasemapState(MANIFEST, { origin: ORIGIN });
    expect(state.available).toBe(true);
    expect(state.primed).toBe(false);
    expect(state.primedBytes).toBe(238_283_859);
    expect(state.totalBytes).toBe(238_283_859 + 64_000_000);
  });
});

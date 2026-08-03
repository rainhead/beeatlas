/**
 * basemap-cache.ts — the basemap's local storage (beeatlas-6rs).
 *
 * Everything about the basemap that touches Cache Storage lives here, so that
 * `basemap-style.ts` stays a pure style builder and `<bee-map>` stays a
 * presenter. Two caches, mirroring the data side's `data-manifest` /
 * `data-artifacts` split:
 *
 *   basemap-manifest — the few hundred bytes naming the current archives.
 *   basemap-archives — the archives themselves, hundreds of megabytes, primed
 *                      only on request (see basemap-prime.ts).
 *
 * WHY CACHE STORAGE AND NOT THE SERVICE WORKER. Cache Storage has no range
 * semantics, and a PMTiles archive is read by range — so the SW cannot serve
 * tiles out of it. What it CAN do is hold the archive as one opaque blob, which
 * is what happens here: `cache.put` the whole file, then read it back with
 * `Blob.slice`. The beeatlas-93t spike measured that read path on an iPhone at a
 * median below the timer resolution and a p95 of 1 ms, which is what settled this
 * against OPFS.
 */

import { PMTiles, type Protocol } from 'pmtiles';
import {
  basemapArchiveUrls,
  basemapManifestUrl,
  parseBasemapManifest,
  type BasemapManifest,
} from './basemap-style.ts';

/** Cache Storage bucket for the basemap manifest. */
export const BASEMAP_MANIFEST_CACHE = 'basemap-manifest';
/** Cache Storage bucket for the PMTiles archives themselves. */
export const BASEMAP_ARCHIVE_CACHE = 'basemap-archives';

/**
 * The kill switch: `localStorage['beeatlas-basemap-offline'] = 'off'` reverts to
 * an online-only basemap, exactly as it behaved before beeatlas-6rs.
 *
 * It gates READING as well as downloading, and that is the point. A local
 * archive is a large blob this code trusts to be well-formed; if a device ever
 * ends up with a corrupt or truncated one, "stop offering the download" would
 * leave the broken copy still in use. Off means the network path, unconditionally.
 *
 * Failing OPEN (any error → enabled) so that a browser which throws on
 * localStorage — Safari in some private modes — gets the feature rather than
 * silently losing it.
 */
export const BASEMAP_OFFLINE_FLAG = 'beeatlas-basemap-offline';

export function basemapOfflineEnabled(): boolean {
  try {
    return localStorage.getItem(BASEMAP_OFFLINE_FLAG) !== 'off';
  } catch {
    return true;
  }
}

/**
 * How long to wait for the manifest before giving up on the network.
 *
 * Inherited from <bee-map>, where it delayed the occurrence layers. It exists for
 * the captive portal that neither answers nor refuses; offline proper does not
 * reach it, because `fetch` rejects in milliseconds with no network. With a cache
 * fallback behind it the timeout got strictly better: the pathological case now
 * ends in a basemap rather than in nothing.
 */
export const BASEMAP_MANIFEST_TIMEOUT_MS = 3000;

/**
 * The current basemap manifest, from the network if it can be had and from the
 * copy primed on a previous online load if it cannot.
 *
 * NETWORK FIRST, deliberately. The archive filenames are date-stamped and the
 * publish prunes superseded ones, so a stale manifest can name a file the server
 * no longer has — which is a broken basemap online, the case that matters most.
 * Offline the network attempt fails in milliseconds and costs nothing.
 *
 * The self-prime is the same pattern as src/manifest.ts and exists for the same
 * reason: the service worker cannot be relied on to have cached this. A freshly
 * installed PWA's first load is uncontrolled (no clientsClaim), so the SW's
 * passive routes never fire — the copy has to be written here.
 *
 * Returns null rather than throwing when there is no manifest to be had from
 * either source. A missing basemap degrades the map; it does not break the app.
 */
export async function loadBasemapManifest(): Promise<BasemapManifest | null> {
  const url = basemapManifestUrl();
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(BASEMAP_MANIFEST_TIMEOUT_MS) });
    if (!resp.ok) throw new Error(`basemap manifest: HTTP ${resp.status}`);
    // Parse BEFORE caching: a payload that cannot produce a style is worse than
    // no cached manifest at all, because it would be served back on every
    // subsequent offline load in place of a good copy from an earlier one.
    const manifest = parseBasemapManifest(await resp.clone().json());
    if (typeof caches !== 'undefined') {
      try {
        const c = await caches.open(BASEMAP_MANIFEST_CACHE);
        await c.put(url, resp);
      } catch { /* best-effort; the manifest is still usable this session */ }
    }
    return manifest;
  } catch (netErr) {
    if (typeof caches !== 'undefined') {
      try {
        const hit = await caches.match(url, { cacheName: BASEMAP_MANIFEST_CACHE });
        if (hit) return parseBasemapManifest(await hit.json());
      } catch (cacheErr) {
        console.warn('[basemap] cached manifest unusable:', cacheErr);
      }
    }
    console.warn('[basemap] no manifest available, rendering without a basemap:', netErr);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Reading a primed archive
// ---------------------------------------------------------------------------

/**
 * A PMTiles {@link Source} backed by a Blob rather than by HTTP range requests.
 *
 * This is the whole offline read path, and it is this short because Cache
 * Storage hands back a real Blob and `Blob.slice` is a view, not a copy — the
 * bytes are paged in from disk on demand, so a 227 MB archive costs 227 MB of
 * disk and essentially no memory. On an iPhone the beeatlas-93t spike measured
 * 50 random 16 KB reads at a median below Safari's timer resolution and a p95 of
 * 1 ms, which is what settled Cache Storage over OPFS.
 *
 * `getKey()` MUST return the same absolute URL the style names after
 * `pmtiles://`, because that string is what Protocol dispatches on. Callers get
 * it from basemapArchiveUrl() rather than assembling it, so the two cannot drift.
 */
/**
 * Read statistics, surfaced by the diagnostics panel (src/diagnostics.ts).
 *
 * These exist because a failed range read is INVISIBLE: PMTiles does not retry,
 * MapLibre marks that one tile errored and moves on, and the result is a hole in
 * the map that a user describes as "some quads have no hillshade". Nothing is
 * logged and nothing throws. A counter is the cheapest way to tell a bad read
 * path from a bad archive.
 */
export const archiveReadStats = {
  /** Incremented when a read STARTS. */
  reads: 0,
  /** Incremented when a read RESOLVES. A gap between this and `reads` means
   *  reads are hanging — which looks identical to "no tiles requested" from
   *  outside, and is the difference between a stalled read path and a stalled
   *  render pipeline. */
  completed: 0,
  retries: 0,
  failures: 0,
  /** Slowest single read, ms. The spike measured p95 of 1 ms on an iPhone; a
   *  number in the seconds means the Blob is not the cheap view it should be. */
  maxMs: 0,
  totalMs: 0,
};

export class BlobSource {
  readonly #url: string;
  #blob: Blob;

  constructor(url: string, blob: Blob) {
    this.#url = url;
    this.#blob = blob;
  }

  getKey(): string {
    return this.#url;
  }

  /**
   * RETRIED ONCE, RE-ACQUIRING THE BLOB, because a rejection here is permanent
   * damage rather than a blip. MapLibre requests many tiles at once, each one a
   * `Blob.slice().arrayBuffer()` against a file of hundreds of megabytes; a
   * single rejection under that concurrency leaves a tile errored forever, and
   * PMTiles has no retry of its own. The second attempt re-reads the handle out
   * of Cache Storage first, so it also recovers a Blob whose backing store the
   * browser has invalidated underneath us — which a long-lived reference to a
   * 227 MB entry is exactly the kind of thing to suffer.
   */
  async getBytes(offset: number, length: number): Promise<{ data: ArrayBuffer }> {
    archiveReadStats.reads++;
    const started = performance.now();
    const done = <T>(v: T): T => {
      const ms = performance.now() - started;
      archiveReadStats.completed++;
      archiveReadStats.totalMs += ms;
      if (ms > archiveReadStats.maxMs) archiveReadStats.maxMs = ms;
      return v;
    };
    try {
      return done({ data: await this.#blob.slice(offset, offset + length).arrayBuffer() });
    } catch (first) {
      archiveReadStats.retries++;
      try {
        const fresh = await cachedArchive(this.#url);
        if (fresh) this.#blob = fresh;
        return done({ data: await this.#blob.slice(offset, offset + length).arrayBuffer() });
      } catch (second) {
        archiveReadStats.failures++;
        console.warn('[basemap] archive read failed twice', this.#url, offset, length, first, second);
        throw second;
      }
    }
  }
}

/** The primed archive at `url`, or null if it has never been downloaded. */
export async function cachedArchive(url: string): Promise<Blob | null> {
  if (typeof caches === 'undefined') return null;
  try {
    const hit = await caches.match(url, { cacheName: BASEMAP_ARCHIVE_CACHE });
    return hit ? await hit.blob() : null;
  } catch (err) {
    console.warn('[basemap] could not read primed archive:', url, err);
    return null;
  }
}

/**
 * Point the pmtiles protocol at any archives already primed on this device, and
 * report how many it found.
 *
 * Registration is per archive and entirely optional: `Protocol` falls back to its
 * own FetchSource for any URL it has not been given, so an unprimed archive keeps
 * working exactly as before over the network. That is also what lets the vector
 * basemap be primed while terrain is not — the two are independent sources.
 *
 * MUST run before `setStyle`. Protocol memoizes a PMTiles instance per URL on
 * first use, and `add()` overwrites that entry — so registering afterwards leaves
 * whatever tiles are already in flight on the network path. Registering first
 * costs nothing when the cache is empty.
 *
 * Deliberately not throwing: a device that cannot read its own cache should fall
 * back to the network, not lose the map.
 */
export async function registerPrimedArchives(
  protocol: Protocol,
  manifest: BasemapManifest,
  options: { region?: string; origin?: string } = {},
): Promise<number> {
  if (!basemapOfflineEnabled()) return 0;
  let registered = 0;
  for (const url of basemapArchiveUrls(manifest, options)) {
    const blob = await cachedArchive(url);
    if (!blob) continue;
    protocol.add(new PMTiles(new BlobSource(url, blob)));
    registered++;
  }
  return registered;
}

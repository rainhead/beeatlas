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

import { basemapManifestUrl, parseBasemapManifest, type BasemapManifest } from './basemap-style.ts';

/** Cache Storage bucket for the basemap manifest. */
export const BASEMAP_MANIFEST_CACHE = 'basemap-manifest';
/** Cache Storage bucket for the PMTiles archives themselves. */
export const BASEMAP_ARCHIVE_CACHE = 'basemap-archives';

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

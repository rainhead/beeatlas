/**
 * basemap-prime.ts — downloading the basemap for offline use (beeatlas-6rs).
 *
 * OPT-IN, unlike the data prime in prime-orchestrator.ts. That one pulls ~33 MB
 * automatically at every cold start; this is ~288 MB, which is not something to
 * start on someone's cellular connection without being asked. So nothing here
 * runs on module load: <bee-atlas> calls it when the user picks the row in the
 * account menu.
 *
 * INSTALLED-ONLY, which is a correctness requirement and not a preference. The
 * beeatlas-93t spike established on real hardware that an installed iOS PWA gets
 * its OWN storage bucket, separate from the Safari tab it was installed from:
 * a marker written by the installed app was invisible to Safari and vice versa,
 * in both directions. So a download started in a browser tab is wrong twice —
 * 288 MB lands in a bucket the installed app will never read, and it is
 * unprotected there, because persist() is granted to the installed app and
 * DENIED to the tab. When not installed, the answer is to offer installation.
 *
 * Events on `window`, mirroring the data prime's shape so <bee-atlas> handles
 * both the same way:
 *   'basemap-prime-progress' (BasemapPrimeProgressDetail) — during streaming
 *   'basemap-state-changed'  (BasemapOfflineState)        — after any change
 */

import {
  BASEMAP_ARCHIVE_CACHE,
  basemapOfflineEnabled,
  cachedArchive,
} from './basemap-cache.ts';
import {
  basemapArchiveUrl,
  DEFAULT_REGION,
  type BasemapManifest,
  type BasemapRegion,
} from './basemap-style.ts';

/** Report progress about every megabyte — this is a ~288 MB download. */
const REPORT_EVERY = 1_000_000;

export interface BasemapPrimeProgressDetail {
  received: number;
  total: number;
  /** The archive currently streaming; null when idle. */
  archiveInFlight: string | null;
}

export interface BasemapOfflineState {
  /** A manifest was found, so there is something that could be downloaded. */
  available: boolean;
  /** Running as an installed PWA. False means offer installation, not download. */
  installed: boolean;
  /** Every archive the current manifest names is present locally. */
  primed: boolean;
  /** Bytes the full set costs, per the manifest. */
  totalBytes: number;
  /** Bytes already present locally. */
  primedBytes: number;
  /** A prime is running right now. */
  downloading: boolean;
}

export const EMPTY_BASEMAP_STATE: BasemapOfflineState = {
  available: false,
  installed: false,
  primed: false,
  totalBytes: 0,
  primedBytes: 0,
  downloading: false,
};

/**
 * Is this an installed PWA rather than a browser tab?
 *
 * `display-mode: standalone` is the standard signal; `navigator.standalone` is
 * the iOS-only one, and iOS is the platform this actually matters on, so both are
 * consulted.
 */
export function isInstalledPWA(): boolean {
  if (typeof window === 'undefined') return false;
  if ((navigator as { standalone?: boolean }).standalone === true) return true;
  try {
    return window.matchMedia('(display-mode: standalone)').matches;
  } catch {
    return false;
  }
}

/**
 * The archives the current manifest names, each with the size the manifest
 * claims for it, in PRIME ORDER: the vector basemap first, terrain last.
 *
 * That order is deliberate. The hillshade already degrades gracefully — a style
 * built from a manifest with no terrain entry is an ordinary, complete basemap
 * (see withHillshade in basemap-style.ts) — so terrain is the natural thing to
 * shed on a device that cannot hold the whole set, and it must never be the
 * reason the vector basemap is missing.
 */
export function plannedArchives(
  manifest: BasemapManifest,
  options: { region?: string; origin?: string } = {},
): Array<{ url: string; bytes: number }> {
  const origin = options.origin ?? location.origin;
  const entry: BasemapRegion | undefined = manifest.regions[options.region ?? DEFAULT_REGION];
  if (!entry) return [];
  const planned = [{ url: basemapArchiveUrl(origin, entry.archive), bytes: entry.bytes || 0 }];
  if (entry.terrain) {
    planned.push({
      url: basemapArchiveUrl(origin, entry.terrain.archive),
      bytes: entry.terrain.bytes || 0,
    });
  }
  return planned;
}

let _downloading = false;

/** What the account menu needs to render the offline-maps row. */
export async function computeBasemapState(
  manifest: BasemapManifest | null,
  options: { region?: string; origin?: string } = {},
): Promise<BasemapOfflineState> {
  const installed = isInstalledPWA();
  if (!manifest || !basemapOfflineEnabled() || typeof caches === 'undefined') {
    return { ...EMPTY_BASEMAP_STATE, installed, downloading: _downloading };
  }
  const planned = plannedArchives(manifest, options);
  let primedBytes = 0;
  let missing = 0;
  for (const a of planned) {
    if (await cachedArchive(a.url)) primedBytes += a.bytes;
    else missing++;
  }
  return {
    available: planned.length > 0,
    installed,
    primed: planned.length > 0 && missing === 0,
    totalBytes: planned.reduce((s, a) => s + a.bytes, 0),
    primedBytes,
    downloading: _downloading,
  };
}

function emitState(state: BasemapOfflineState): void {
  window.dispatchEvent(new CustomEvent<BasemapOfflineState>('basemap-state-changed', {
    detail: state, bubbles: true, composed: true,
  }));
}

function emitProgress(detail: BasemapPrimeProgressDetail): void {
  window.dispatchEvent(new CustomEvent<BasemapPrimeProgressDetail>('basemap-prime-progress', {
    detail, bubbles: true, composed: true,
  }));
}

/**
 * Download one archive into Cache Storage, reporting bytes as they arrive.
 *
 * The body is collected and then written in a SINGLE cache.put, which is the
 * shape the beeatlas-93t spike verified on an iPhone: the real 238,283,859-byte
 * archive stored in 905 ms with byte-exact readback, no chunking and no quota
 * rejection. Piping the response body straight through a counting
 * TransformStream would hold less memory and is the obvious refinement, but it is
 * NOT what was measured on the device, and every failure in this area has been
 * silent — so this stays on proven ground until someone re-runs the harness.
 *
 * Not `res.clone()` into the cache while reading the original for progress (the
 * data prime's pattern): clone() tees the stream, and with one branch merely
 * counting bytes and the other writing to disk, the fast branch would run ahead
 * and the tee would buffer the whole archive on top of what the cache is holding.
 * That is affordable at 33 MB and not at 288 MB.
 */
async function primeArchive(
  url: string,
  fallbackBytes: number,
  runState: { received: number; total: number },
): Promise<void> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`basemap prime: ${url} → ${res.status}`);

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let lastReported = runState.received;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    runState.received += value.byteLength;
    if (runState.received - lastReported >= REPORT_EVERY) {
      emitProgress({ received: runState.received, total: runState.total, archiveInFlight: url });
      lastReported = runState.received;
    }
  }

  const cache = await caches.open(BASEMAP_ARCHIVE_CACHE);
  await cache.put(url, new Response(new Blob(chunks as BlobPart[]), {
    headers: { 'content-type': 'application/octet-stream' },
  }));
  // The manifest's byte count is a claim; this is the measured truth. Correcting
  // the denominator here keeps the progress bar honest for the archives still to
  // come rather than letting it overshoot or stall short of 100%.
  runState.total += chunks.reduce((s, c) => s + c.byteLength, 0) - fallbackBytes;
  emitProgress({ received: runState.received, total: runState.total, archiveInFlight: url });
}

/**
 * Delete primed archives the current manifest no longer names. This is what makes
 * a republish REPLACE rather than accumulate: the superseded archive's URL simply
 * stops appearing in the manifest, so it stops being kept.
 *
 * ONLY ONCE THE WHOLE NEW SET IS SAFELY STORED. Deleting first — or deleting
 * after a partial success — is how a quarterly republish leaves someone in the
 * field with no basemap at all because the replacement download failed halfway,
 * which is strictly worse than a stale one. Nothing is evicted until there is
 * something complete to evict it in favour of.
 *
 * Holding both generations in the meantime is affordable: the beeatlas-93t spike
 * measured a 38.4 GB quota on iOS 18.7, against ~576 MB for two full sets.
 *
 * The cost of the strict rule is that a persistently failing terrain download
 * keeps the previous generation alive alongside the new vector archive. That is
 * a broken publish rather than a normal state, it self-heals on the next
 * complete prime, and it is logged rather than silent.
 */
async function pruneSupersededArchives(keep: Set<string>): Promise<void> {
  try {
    const cache = await caches.open(BASEMAP_ARCHIVE_CACHE);
    const present = new Set((await cache.keys()).map((r) => r.url));
    const incomplete = [...keep].filter((url) => !present.has(url));
    if (incomplete.length > 0) {
      console.warn(
        '[basemap] keeping superseded archives: the new set is incomplete',
        incomplete,
      );
      return;
    }
    for (const req of await cache.keys()) {
      if (keep.has(req.url)) continue;
      console.info('[basemap] evicting superseded archive:', req.url);
      await cache.delete(req);
    }
  } catch (err) {
    console.warn('[basemap] could not prune superseded archives:', err);
  }
}

/**
 * Download every archive the manifest names, in prime order.
 *
 * Refuses outside an installed PWA — see the header: in a browser tab the bytes
 * land in a bucket the installed app cannot read, and are unprotected there.
 *
 * Resumable by construction: an archive already in Cache Storage is skipped, so
 * an interrupted prime picks up at the next whole archive rather than starting
 * over. Within an archive there is no resume; a 227 MB file is one unit.
 */
export async function primeBasemap(
  manifest: BasemapManifest,
  options: { region?: string; origin?: string } = {},
): Promise<BasemapOfflineState> {
  if (_downloading) return computeBasemapState(manifest, options);
  if (!basemapOfflineEnabled() || typeof caches === 'undefined' || !isInstalledPWA()) {
    return computeBasemapState(manifest, options);
  }

  _downloading = true;
  emitState(await computeBasemapState(manifest, options));
  try {
    // Ask before the download, not after. The spike found persist() is GRANTED to
    // the installed app and denied to a Safari tab, and persistence governs
    // eviction under storage PRESSURE — which is exactly the risk a 288 MB cache
    // runs. Best-effort: nothing is gated on the answer.
    try { await navigator.storage?.persist?.(); } catch { /* diagnostics only */ }

    const planned = plannedArchives(manifest, options);
    const runState = { received: 0, total: planned.reduce((s, a) => s + a.bytes, 0) };

    for (const { url, bytes } of planned) {
      const already = await cachedArchive(url);
      if (already) {
        runState.received += already.size;
        emitProgress({ received: runState.received, total: runState.total, archiveInFlight: null });
        continue;
      }
      try {
        await primeArchive(url, bytes, runState);
      } catch (err) {
        // Keep going. Terrain is last and optional, so a failure there still
        // leaves a complete, usable offline basemap — the whole reason it is last.
        console.warn('[basemap] archive prime failed:', url, err);
      }
    }

    await pruneSupersededArchives(new Set(planned.map((a) => a.url)));
    emitProgress({ received: runState.received, total: runState.total, archiveInFlight: null });
  } finally {
    _downloading = false;
  }

  const state = await computeBasemapState(manifest, options);
  emitState(state);
  return state;
}

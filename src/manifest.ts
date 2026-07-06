const _BASE = (import.meta.env.VITE_DATA_BASE_URL as string | undefined) ?? 'https://beeatlas.net/data';

interface Manifest {
  occurrences: string;
  occurrences_db?: string;
  species: string;
  seasonality: string;
  counties: string;
  ecoregions: string;
  wilderness: string;    // points to hashed wilderness.geojson (no-collect overlay)
  places: string;        // points to hashed places.geojson
  places_meta: string;   // points to hashed places.json
  checklist: string;
  generated_at: string;
}

let _promise: Promise<Manifest> | null = null;

/** Cache Storage bucket for manifest.json — same name as the SW NetworkFirst route. */
const MANIFEST_CACHE = 'data-manifest';

async function _loadManifestOnce(): Promise<Manifest> {
  const url = `${_BASE}/manifest.json`;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`manifest.json: ${r.status}`);
    // Self-prime: write a copy straight into Cache Storage so an offline cold-start
    // can read it WITHOUT depending on the service worker controlling this client.
    // The SQLite worker runs outside the /app SW scope, and a freshly-installed
    // PWA's first page load is uncontrolled (no clientsClaim) — in both cases the
    // SW's passive NetworkFirst route never fires, so we cache it ourselves here
    // (Phase 151 offline cold-start fix).
    if (typeof caches !== 'undefined') {
      try { const c = await caches.open(MANIFEST_CACHE); await c.put(url, r.clone()); } catch { /* best-effort */ }
    }
    return await r.json() as Manifest;
  } catch (netErr) {
    // Offline / network failure: fall back to the copy primed on a prior online load.
    if (typeof caches !== 'undefined') {
      const hit = (await caches.match(url, { cacheName: MANIFEST_CACHE })) ?? (await caches.match(url));
      if (hit) return await hit.json() as Manifest;
    }
    throw netErr;
  }
}

export function loadManifest(): Promise<Manifest> {
  if (!_promise) {
    // Do NOT memoize a rejected fetch: a failed boot (e.g. offline before the
    // manifest was cached) would otherwise stay sticky and block recovery when
    // connectivity returns. Clear the cache on failure so the next call retries.
    _promise = _loadManifestOnce().catch((err: unknown) => { _promise = null; throw err; });
  }
  return _promise;
}

const DAY_MS = 86_400_000;

/**
 * Parse `generated_at` from the manifest. Returns `null` for the dev sentinel
 * `"local"` or any unparseable string (D-12).
 */
export function parseGeneratedAt(generatedAt: string): Date | null {
  const d = new Date(generatedAt);
  if (Number.isNaN(d.getTime())) {
    console.warn('[freshness] unparseable generated_at:', generatedAt);
    return null;
  }
  return d;
}

/**
 * Format a `generated_at` string as a freshness label per CONTEXT D-09 / D-12
 * and UI-SPEC §Copywriting Contract.
 *
 * Returns:
 *   - 'Today'                      if delta < 1 day
 *   - 'Yesterday'                  if delta < 2 days
 *   - 'N days ago'                 if delta < 7 days (Intl.RelativeTimeFormat)
 *   - 'Data as of Mon DD, YYYY'    if delta < 1 year
 *   - 'Data as of Mon YYYY'        if delta >= 1 year
 *   - null                         if generatedAt is unparseable (+ console.warn)
 */
export function formatFreshness(
  generatedAt: string,
  now: Date = new Date(),
  locale: string = 'en-US',
): string | null {
  const parsed = parseGeneratedAt(generatedAt);
  if (parsed === null) return null;

  const deltaMs = now.getTime() - parsed.getTime();
  const deltaDays = Math.floor(deltaMs / DAY_MS);

  if (deltaDays < 1) return 'Today';
  if (deltaDays < 2) return 'Yesterday';
  if (deltaDays < 7) {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'always' });
    return rtf.format(-deltaDays, 'day'); // "3 days ago"
  }
  // >= 7 days: absolute
  const oneYear = 365 * DAY_MS;
  if (deltaMs < oneYear) {
    const dtf = new Intl.DateTimeFormat(locale, {
      year: 'numeric', month: 'short', day: 'numeric',
    });
    return `Data as of ${dtf.format(parsed)}`;
  }
  // >= 1 year: drop the day
  const dtf = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short' });
  return `Data as of ${dtf.format(parsed)}`;
}

/**
 * Convenience: load the manifest and return the formatted freshness label.
 * Returns null if the manifest fails to load or generated_at is unparseable (D-11).
 */
export async function loadFreshnessLabel(): Promise<string | null> {
  try {
    const m = await loadManifest();
    return formatFreshness(m.generated_at);
  } catch {
    return null;
  }
}

type DataKey = keyof Omit<Manifest, 'generated_at'>;

export async function resolveDataUrl(key: DataKey): Promise<string | null> {
  const m = await loadManifest();
  const file = m[key];
  return file ? `${_BASE}/${file}` : null;
}

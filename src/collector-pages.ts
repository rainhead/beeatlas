import { resolveDataUrl } from './manifest.ts';

// iNat login -> { /collectors/ page href, display name } (beeatlas-7nx.6, beeatlas-8a7r).
//
// The people counterpart to src/taxon-pages.ts, and it exists for the same reason:
// PAGE EXISTENCE IS NOT A FUNCTION OF A NAME. A collector page is emitted only for
// the entries in collectors.json, while the app's people come from the occurrences
// DB. Measured 2026-08-03: 124 logins have pages against 158 distinct
// host_inat_login values on occurrences, so guessing `/collectors/<login>/` from the
// DB would send 22% of readers to a 404.
//
// The obvious alternative — fetch collectors.json and read its logins — costs 2.8 MB
// to learn 124 strings, nearly all of it stats and event pages the app never reads.
// The site build emits this slim map instead, from the very list Eleventy paginates
// over, so it cannot disagree with the pages that build produced.
//
// Fetched LAZILY, after the occurrences DB is up, so it never competes on the
// startup path. Content-hashed via the manifest, so it caches immutably and can
// never go stale against the pages.

/**
 * What the published map knows about one person: where their page is, and what
 * to call them. `name` is the pipeline's display_name — most recent recordedBy,
 * '@login' when no row ever carried one — so the card and the collector page
 * cannot call the same person different things.
 */
export interface CollectorPage {
  href: string;
  name: string | null;
}

/**
 * Parse the published map, tolerating BOTH shapes it has had.
 *
 * Before 2026-08-29 the value was a bare href string; a browser holding that
 * cached JSON must degrade to "links but no names" rather than throw and lose
 * the links as well. Exported for its own tests — the fetch around it is the
 * uninteresting half.
 */
export function parseCollectorPages(json: unknown): Record<string, CollectorPage> {
  if (json === null || typeof json !== 'object' || Array.isArray(json)) return {};
  const out: Record<string, CollectorPage> = {};
  for (const [login, value] of Object.entries(json as Record<string, unknown>)) {
    if (typeof value === 'string') { out[login] = { href: value, name: null }; continue; }
    if (value === null || typeof value !== 'object') continue;
    const { href, name } = value as { href?: unknown; name?: unknown };
    if (typeof href !== 'string') continue;
    out[login] = { href, name: typeof name === 'string' && name !== '' ? name : null };
  }
  return out;
}

let _promise: Promise<Record<string, CollectorPage>> | null = null;

/**
 * The login->{href,name} map, or an empty map when this build published none.
 *
 * Never rejects: a missing or unreadable map means "no links", which is the same
 * graceful degradation the taxa pane applies. A dead link is a worse outcome than
 * a name with nothing to click.
 */
export function loadCollectorPages(): Promise<Record<string, CollectorPage>> {
  if (_promise) return _promise;
  _promise = (async () => {
    try {
      const url = await resolveDataUrl('collector_pages');
      if (!url) return {};
      const resp = await fetch(url);
      if (!resp.ok) return {};
      const json: unknown = await resp.json();
      if (json === null || typeof json !== 'object' || Array.isArray(json)) return {};
      return parseCollectorPages(json);
    } catch {
      return {};
    }
  })();
  return _promise;
}

/** Test-only: forget the memoized fetch between cases. */
export function _resetCollectorPages(): void { _promise = null; }

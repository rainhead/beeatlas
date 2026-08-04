import { resolveDataUrl } from './manifest.ts';

// iNat login -> /collectors/ page href (beeatlas-7nx.6).
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

let _promise: Promise<Record<string, string>> | null = null;

/**
 * The login->page map, or an empty map when this build published none.
 *
 * Never rejects: a missing or unreadable map means "no links", which is the same
 * graceful degradation the taxa pane applies. A dead link is a worse outcome than
 * a name with nothing to click.
 */
export function loadCollectorPages(): Promise<Record<string, string>> {
  if (_promise) return _promise;
  _promise = (async () => {
    try {
      const url = await resolveDataUrl('collector_pages');
      if (!url) return {};
      const resp = await fetch(url);
      if (!resp.ok) return {};
      const json: unknown = await resp.json();
      if (json === null || typeof json !== 'object' || Array.isArray(json)) return {};
      return json as Record<string, string>;
    } catch {
      return {};
    }
  })();
  return _promise;
}

/** Test-only: forget the memoized fetch between cases. */
export function _resetCollectorPages(): void { _promise = null; }

import { resolveDataUrl } from './manifest.ts';

// taxon_id -> /species/ page href (beeatlas-dt7).
//
// WHY THIS IS DATA AND NOT A FUNCTION. Page existence is not derivable from a
// taxon's name. /species/Apidae/ does not exist (no family pages).
// /species/Bombus/californicus/ does not exist (it folds into fervidus). And 20 of
// 646 Anthophila taxa with occurrences have no page at all, for curation reasons
// that cannot be resolved from the data. String-munging taxa.name would therefore
// send readers to 404s — worse than showing no link. The map is emitted by the
// SITE build from the very lists Eleventy paginates over (_data/species.js), so it
// cannot disagree with the pages that build actually produced.
//
// Fetched LAZILY — only when the taxa pane first opens — so it never competes with
// the occurrences DB on the startup path. ~38 KB for 744 taxa, content-hashed via
// the manifest, so it caches immutably and can never go stale against the pages.

let _promise: Promise<Record<string, string>> | null = null;

/**
 * The taxon->page map, or an empty map when this build published none.
 *
 * Never rejects: a missing or unreadable map means "no links", which is the same
 * graceful degradation the templates apply to ungenerated cross-links. A dead
 * link would be a worse outcome than a plain-text name.
 */
export function loadTaxonPages(): Promise<Record<string, string>> {
  if (_promise) return _promise;
  _promise = (async () => {
    try {
      const url = await resolveDataUrl('taxon_pages');
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

/** Test-only: drop the cached fetch so each case starts clean. */
export function _resetTaxonPages(): void { _promise = null; }

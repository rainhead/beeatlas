// Scoped render (beeatlas-4oa): render only the species pages a note publish
// touched, instead of all 1668 pages.
//
// A note reaches exactly one template — _pages/species-detail.njk, via
// _data/notes.js keyed by canonical_name — and this site defines no Eleventy
// `collections`, so dropping every other template from a build cannot change the
// output of the one that remains. That is what makes a partial render sound here.
//
// The env contract mirrors Stelis's STELIS_REBUILD_KEYS (st-pd1) verbatim, since
// that is where the key set comes from: newline-separated (a key may contain
// spaces), and PRESENCE is the signal. Unset = full render. Set-but-empty = a
// legitimate zero-key render, not a full one.
//
// Callers: eleventy.config.js (which templates to ignore) and _data/species.js
// (which species to paginate over). Both read it through this one function so
// the two can never disagree about what "scoped" means.

const ENV_KEY = 'BEEATLAS_RENDER_KEYS';

/**
 * @returns {Set<string>|null} the canonical_names to render, or null for a full render.
 */
export function renderScope(env = process.env) {
  if (!(ENV_KEY in env)) return null;
  return new Set(env[ENV_KEY].split('\n').filter(Boolean));
}

// How fresh the DATA is — the value behind the header's "Data as of" label
// (src/manifest.ts formatFreshness), NOT when the site was built (beeatlas-923).
//
// The stamp is written by scripts/fetch-data.sh into the data dir, on a FULL pipeline
// run and only then. The site build reads it here (scripts/postbuild-data.mjs) instead
// of stamping its own clock, which is what keeps a code-only deploy or a note publish
// from claiming the data is fresh: those paths rebuild the site against an unchanged
// export, so they inherit whatever the last real refresh wrote.
//
// It lives in lib/ rather than inline in postbuild-data.mjs so it can be tested without
// running that script, which owns (and rmSync's) _site/data.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The dev/unknown sentinel. src/manifest.ts treats it as unparseable and hides the
 *  label (D-12) — the right answer for `npm run dev` and for a data dir filled by
 *  `npm run pull-published`, neither of which refreshed anything. */
export const NO_STAMP = 'local';

/**
 * Read `<dataDir>/generated_at` (epoch seconds) as an ISO-8601 string.
 *
 * Returns NO_STAMP for anything we can't trust — absent, empty, non-numeric, or a
 * non-positive epoch. Erring toward "unknown" hides the label; erring the other way
 * would print a confident wrong date, and the whole point of this field is that it
 * only ever claims what the data supports.
 */
export function readGeneratedAt(dataDir) {
  const stampPath = join(dataDir, 'generated_at');
  if (!existsSync(stampPath)) return NO_STAMP;
  let raw;
  try {
    raw = readFileSync(stampPath, 'utf8').trim();
  } catch {
    return NO_STAMP;
  }
  if (!raw) return NO_STAMP;
  const epoch = Number(raw);
  if (!Number.isFinite(epoch) || epoch <= 0) return NO_STAMP;
  const date = new Date(epoch * 1000);
  if (Number.isNaN(date.getTime())) return NO_STAMP;
  return date.toISOString();
}

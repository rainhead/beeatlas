// Redirects for names the atlas has folded away.
//
// When a name becomes a synonym, its species page stops being generated — the
// occurrence and checklist arms all key on the accepted name, so there is no row
// left to paginate over. Any link to the old page then 404s: /species/Bombus/
// californicus/ has done exactly that since B. californicus was folded into
// B. fervidus on 2026-07-26. Those links are in other people's bookmarks, in
// iNaturalist comments and in email, and a 404 tells the reader nothing about
// where the species went.
//
// So each folded name keeps a page at its old URL that sends the reader to the
// accepted one, and says why.
//
// Read from the dbt SEEDS, not from a published artifact. The seeds are the
// committed authority for synonymy (ADR 0009 — external authority is baked into
// git at build time, not looked up), they are the same three arms int_synonyms
// unions, and reading them here means a synonym added to a seed brings its
// redirect with it. No new artifact, no manifest key, nothing for the pipeline
// to publish.
//
// A true 301 would be better for search engines, but the serving vhost sets
// AllowOverride None, so a build-emitted .htaccess is ignored and a redirect
// rule would have to live in Apache config outside this repo. A zero-delay meta
// refresh plus rel=canonical is the static-hosting equivalent and is treated as
// a permanent redirect.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import species from './species.js';

const here = dirname(fileURLToPath(import.meta.url));
const seedsDir = join(here, '..', 'data', 'dbt', 'seeds');

// The three arms int_synonyms unions, in its precedence order. auto_synonyms is
// usually header-only; it is read anyway so a future entry is not silently missed.
const SEEDS = ['occurrence_synonyms.csv', 'auto_synonyms.csv', 'gbif_checklist_synonyms.csv'];

// These CSVs are hand-maintained and quote nothing, so a split is enough — but
// the two seed shapes differ, and the header says which is which. The curated
// seeds end at `source`, whose prose may contain commas, so everything after the
// second comma is the source. gbif_checklist_synonyms carries three more columns
// after it (usage key, match type, confidence), so there the source is one field.
// Reading the header rather than assuming keeps a column added upstream from
// silently landing in the text shown to a reader.
function readSynonymSeed(file) {
  let text;
  try {
    text = readFileSync(join(seedsDir, file), 'utf8');
  } catch {
    return []; // a seed that no longer exists contributes no redirects
  }
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const sourceIsRest = lines[0].split(',').length === 3;

  return lines
    .slice(1) // header
    .map(line => {
      const first = line.indexOf(',');
      const second = line.indexOf(',', first + 1);
      if (first === -1 || second === -1) return null;
      const tail = line.slice(second + 1);
      return {
        synonym: line.slice(0, first).trim(),
        accepted: line.slice(first + 1, second).trim(),
        source: (sourceIsRest ? tail : tail.split(',')[0]).trim(),
      };
    })
    .filter(Boolean);
}

// First arm to name a synonym wins, matching int_synonyms' anti-join precedence.
const bySynonym = new Map();
for (const file of SEEDS) {
  for (const row of readSynonymSeed(file)) {
    if (row.synonym && row.accepted && !bySynonym.has(row.synonym)) bySynonym.set(row.synonym, row);
  }
}

// canonical_name -> the species page that exists for it.
const pageByCanonical = new Map(
  species.speciesList.filter(sp => sp.slug).map(sp => [sp.canonical_name, sp]),
);

// A binomial's page slug is `Genus/epithet`. Deriving it here rather than reusing
// the pipeline's _slugify is safe because every synonym is a plain two-token latin
// binomial — anything else is skipped below rather than guessed at.
function slugFor(canonicalName) {
  const parts = canonicalName.split(' ');
  if (parts.length !== 2) return null;
  const [genus, epithet] = parts;
  if (!/^[a-z-]+$/.test(genus) || !/^[a-z-]+$/.test(epithet)) return null;
  return `${genus.charAt(0).toUpperCase()}${genus.slice(1)}/${epithet}`;
}

const titleCase = name => name.charAt(0).toUpperCase() + name.slice(1);

const redirects = [];
for (const { synonym, accepted, source } of bySynonym.values()) {
  // If the synonym still has a page of its own, the fold has not taken effect in
  // the data yet (assert_no_synonym_survives_as_species catches that in dbt).
  // Emitting a redirect here would collide with that page's permalink, so skip.
  if (pageByCanonical.has(synonym)) continue;

  const target = pageByCanonical.get(accepted);
  if (!target) continue; // nothing to point at — the accepted name has no page

  const fromSlug = slugFor(synonym);
  if (!fromSlug) continue;

  redirects.push({
    fromSlug,
    fromName: titleCase(synonym),
    toSlug: target.slug,
    toName: target.scientificName,
    // The seed's `source` column is the curatorial note — why the name was folded.
    // Shown to the reader, since "this page moved" without a reason is a dead end.
    reason: source || null,
  });
}

redirects.sort((a, b) => a.fromSlug.localeCompare(b.fromSlug));

export default { redirects };

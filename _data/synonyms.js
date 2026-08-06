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
// A true 301 would be better for search engines, and SINCE THIS WAS WRITTEN we have
// one. The obstacle described here — AllowOverride None, so a build-emitted .htaccess
// is ignored — was solved from the other side instead: species-redirects-map.njk emits
// `species-redirects.map`, and Apache reads it as a RewriteMap via an Include outside
// this repo (/etc/apache2/beeatlas-species-redirects.conf, included from both vhosts).
//
// CONSEQUENCE, which is easy to miss: the pages this file generates are NO LONGER
// SERVED. Apache 301s /species/<Genus>/<folded>/ straight to the accepted name, so a
// reader never receives the meta-refresh HTML, never sees the "reason" line, and never
// sees whatever `source` says. Verified against production 2026-08-06.
//
// That is BY DESIGN, not an oversight — beeatlas-species-redirects.conf calls these
// pages "belt and braces": if the map is ever missing or stale, the reader is still
// forwarded, so the failure mode is a slower redirect rather than a 404. Keep emitting
// them, and keep testing them; they are the fallback, and rel=canonical rides on them.
//
// The one thing not to conclude is that the reason line is user-facing COPY. On a
// healthy server nobody reads it, so it is worth no wordsmithing and no publish of its
// own — which is also why a bug in it can survive being "verified" by rendering the
// page locally.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import species from './species.js';

const here = dirname(fileURLToPath(import.meta.url));
const seedsDir = join(here, '..', 'data', 'dbt', 'seeds');

// The three arms int_synonyms unions, in its precedence order. auto_synonyms is
// usually header-only; it is read anyway so a future entry is not silently missed.
const SEEDS = ['occurrence_synonyms.csv', 'auto_synonyms.csv', 'gbif_checklist_synonyms.csv'];

// The two seed shapes differ, and the header says which is which. The curated seeds
// end at `source`, whose prose may contain commas, so everything after the second
// comma is the source. gbif_checklist_synonyms carries three more columns after it
// (usage key, match type, confidence), so there the source is one field. Reading the
// header rather than assuming keeps a column added upstream from silently landing in
// the text shown to a reader.
//
// `source` MAY be RFC4180-quoted. It went unquoted for a long time, so this used to
// split and take the rest — until a citation containing commas was added, quoted, and
// the surrounding quote characters leaked into the rendered text. dbt's seed loader
// parses quoting properly, so the database was right and only this reader was wrong,
// which is the kind of divergence that survives review. Unquote explicitly.
function unquoteCsvField(value) {
  const v = value.trim();
  if (v.length < 2 || !v.startsWith('"') || !v.endsWith('"')) return v;
  return v.slice(1, -1).replace(/""/g, '"'); // RFC4180 escapes a quote by doubling it
}

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
        source: unquoteCsvField(sourceIsRest ? tail : tail.split(',')[0]),
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

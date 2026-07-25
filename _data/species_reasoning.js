// Build-time DERIVED-TRAIT feed for the species detail page (stelis st-ozp).
//
// Reads public/data/species_reasoning.json, produced by stelis's `taxon-reasoning`
// node — a Datalog closure that inherits curated high-rank trait assertions
// ("all Nomadinae are cleptoparasitic") down the taxonomic rank tree to every
// descendant species. The artifact has two halves:
//   glossary: Record<value, definition>   what a trait value MEANS, said once
//   species:  Record<canonical_name, DerivedTrait[]> where DerivedTrait is
//     { trait, value, because: { rank, taxon }, explanation, hosts?, note? }
//
// The split is deliberate and was a review finding: an earlier version inlined a
// definition of cleptoparasitism into every species' sentence, so a reader
// visiting two cuckoo pages met the same paragraph twice while the part that
// actually differs between lineages — WHO they parasitize — was buried in it.
// The definition now ships once and renders once per page; `hosts` carries the
// per-lineage substance; `note` appears only where a lineage has something
// genuinely particular (Psithyrus parasitizes a colony, not a cell).
//
// `explanation` is the point, and the reason this is not just another trait
// column: it is a proof rendered as a sentence — "Nomada bella is
// cleptoparasitic, inherited from the subfamily Nomadinae. Nomadine bees are
// cuckoos…" — computed at build time from the same provenance machinery stelis
// uses for its operator `--why`, with the audience flipped to a learner.
//
// These traits are a SEPARATE published field from species_traits' Bee-Gap
// values, deliberately: stelis reports how far the two agree (95 agree, 11 gaps
// filled at time of writing) but never rewrites one into the other. Merging them
// is this side's decision, and is not made yet — the page shows the derived
// explanation alongside the measured trait rather than in place of it.
//
// The loader is ABSENCE-TOLERANT, like _data/species_hosts.js: if the artifact
// does not yet exist (a code deploy ahead of the first nightly) or fails to
// parse, it returns {} so `npm run dev`, `npm test`, and CI all succeed.
//
// Default-export ONLY: Eleventy 3 auto-unwraps the default export of a
// _data/*.js file iff the module has no other named exports. Adding a named
// export here would hide the table behind `species_reasoning.default`.

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildDataDir } from '../lib/build-data-dir.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const speciesReasoningPath = join(buildDataDir(repoRoot), 'species_reasoning.json');

let raw = { glossary: {}, species: {} };
if (existsSync(speciesReasoningPath)) {
  try {
    const parsed = JSON.parse(readFileSync(speciesReasoningPath, 'utf8'));
    raw = { glossary: parsed.glossary ?? {}, species: parsed.species ?? {} };
  } catch (err) {
    console.warn(`_data/species_reasoning.js: WARNING — could not parse ${speciesReasoningPath} (${err}); returning empty`);
  }
}

// Per species, the DISTINCT terms its derived traits use, paired with their
// definitions — so the template can render each definition once without doing
// dedup gymnastics in Nunjucks (which has no `unique` filter). Shaping data is
// this layer's job; the template stays declarative.
const terms = Object.fromEntries(
  Object.entries(raw.species).map(([canonical, traits]) => [
    canonical,
    [...new Set(traits.map((t) => t.value))]
      .filter((value) => raw.glossary[value])
      .map((value) => ({ value, definition: raw.glossary[value] })),
  ]),
);

export default { glossary: raw.glossary, species: raw.species, terms };

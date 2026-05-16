// Build-time data feed for the species page. Read by Eleventy's data cascade
// and exposed to _pages/species.njk as the `species` global.
//
// Contract (PAGE-02): exports { tree, flat, byScientificName }.
// - flat: alphabetical-by-scientificName array (D-01)
// - byScientificName: lookup map keyed by scientificName
// - tree: family -> subfamily -> tribe -> genus -> subgenus nested object;
//   placeholder shape -- Phase 81 (NAV-01) will harden.
//
// Pitfall #8: this module reads species.json (NOT the upstream columnar store)
// so Eleventy's HMR stays sub-100ms. Asserted by src/tests/data-species.test.ts.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const speciesJsonPath = join(repoRoot, 'public/data/species.json');
const seasonalityJsonPath = join(repoRoot, 'public/data/seasonality.json');

const raw = JSON.parse(readFileSync(speciesJsonPath, 'utf8'));

// Derive county and ecoregion_l3 option lists from seasonality.json keys.
// Keys are shaped 'county:<name>' and 'ecoregion_l3:<name>' per Phase 78
// pipeline (data/export.py). Phase 81 NAV/FILT widgets consume these arrays.
const seasonality = JSON.parse(readFileSync(seasonalityJsonPath, 'utf8'));
const countiesSet = new Set();
const ecoregionL3Set = new Set();
for (const speciesEntry of Object.values(seasonality)) {
  for (const key of Object.keys(speciesEntry)) {
    if (key.startsWith('county:')) countiesSet.add(key.slice('county:'.length));
    else if (key.startsWith('ecoregion_l3:')) ecoregionL3Set.add(key.slice('ecoregion_l3:'.length));
  }
}
const counties = [...countiesSet].sort();
const ecoregionL3 = [...ecoregionL3Set].sort();

const flat = raw
  .slice()
  .sort((a, b) => a.scientificName.localeCompare(b.scientificName));

const byScientificName = Object.fromEntries(
  flat.map((s) => [s.scientificName, s])
);

const TAXON_LEVELS = ['family', 'subfamily', 'tribe', 'genus', 'subgenus'];

function buildTree(rows) {
  const root = { rows: [], children: new Map() };
  for (const r of rows) {
    let node = root;
    for (const level of TAXON_LEVELS) {
      const key = r[level] == null ? 'null' : String(r[level]);
      if (!node.children.has(key)) {
        node.children.set(key, { rows: [], children: new Map() });
      }
      node = node.children.get(key);
    }
    node.rows.push(r);
  }
  return toPlain(root);
}

function toPlain(node) {
  return {
    rows: node.rows,
    children: Object.fromEntries(
      [...node.children].map(([k, v]) => [k, toPlain(v)])
    ),
  };
}

const tree = buildTree(flat);

// Phase 93 D-01: HSL→hex formula matching Python colorsys.hls_to_rgb exactly.
// Color index i is derived from alphabetical-by-canonical_name sort within each
// genus group (D-02). Formula verified numerically for hue=0→#d92626, hue=120→#26d926,
// hue=240→#2626d9. Do NOT refactor — numerical equivalence is load-bearing.
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2*l - 1)) * s;
  const x = c * (1 - Math.abs((h/60) % 2 - 1));
  const m = l - c/2;
  let r=0, g=0, b=0;
  if (h < 60)       { r=c; g=x; b=0; }
  else if (h < 120) { r=x; g=c; b=0; }
  else if (h < 180) { r=0; g=c; b=x; }
  else if (h < 240) { r=0; g=x; b=c; }
  else if (h < 300) { r=x; g=0; b=c; }
  else              { r=c; g=0; b=x; }
  const toHex = n => Math.round((n+m)*255).toString(16).padStart(2,'0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

// Filter to actual species entries (excludes genus-level records where specific_epithet is null)
const speciesList = flat.filter(s => s.specific_epithet !== null);

// Build genus groupings with HSL colors matching Phase 93 D-01 / D-02 sort order.
const genusMap = {};
for (const sp of speciesList) {
  if (!genusMap[sp.genus]) {
    genusMap[sp.genus] = { genus: sp.genus, family: sp.family, subfamily: sp.subfamily, species: [] };
  }
  genusMap[sp.genus].species.push(sp);
}
const genusList = Object.values(genusMap)
  .sort((a, b) => a.genus.localeCompare(b.genus))
  .map(g => {
    // D-01/D-02: sort alphabetically by canonical_name — matches SVG color assignment order
    const sorted = g.species.slice().sort((a, b) => a.canonical_name.localeCompare(b.canonical_name));
    const n = sorted.length;
    const speciesWithColors = sorted.map((sp, i) => ({
      ...sp,
      hexColor: sp.occurrence_count > 0 ? hslToHex(i * 360 / n, 70, 50) : '#cccccc',
    }));
    return {
      ...g,
      species: speciesWithColors,
      speciesCount: sorted.length,
      totalOccurrences: sorted.reduce((acc, sp) => acc + sp.occurrence_count, 0),
    };
  });

export default { tree, flat, byScientificName, counties, ecoregionL3, speciesList, genusList };

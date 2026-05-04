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

const raw = JSON.parse(readFileSync(speciesJsonPath, 'utf8'));

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

export default { tree, flat, byScientificName };

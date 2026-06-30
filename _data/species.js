// Build-time data feed for the species page. Read by Eleventy's data cascade
// and exposed to _pages/species.njk as the `species` global.
//
// Contract: exports { flat, byScientificName, fullTree, ... }.
// - flat: alphabetical-by-scientificName array (D-01)
// - byScientificName: lookup map keyed by scientificName
// - fullTree: bee-only six-rank nested tree consumed by _pages/species.njk (Phase 133)
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
const higherTaxaPath = join(repoRoot, 'public/data/higher_taxa.json');

const raw = JSON.parse(readFileSync(speciesJsonPath, 'utf8'));
const higherTaxa = JSON.parse(readFileSync(higherTaxaPath, 'utf8'));
// Index by rank + name for O(1) lookup:
// higherTaxaByRankName['genus']['Andrena'] -> { taxon_id: ..., specimen_count: ..., ... }
const higherTaxaByRankName = {};
for (const row of higherTaxa) {
  if (!higherTaxaByRankName[row.rank]) higherTaxaByRankName[row.rank] = {};
  higherTaxaByRankName[row.rank][row.name] = row;
}

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

// Phase 174 D-05: resolve host_bees comma-joined strings to typed link targets.
// Uses byScientificName (species-level) and higherTaxaByRankName['genus'] (genus-level).
// Returns null for absent host_bees; otherwise an array of typed entries.
// Security: only byScientificName matches yield a slug (safe path); only
// higherTaxaByRankName['genus'] matches yield a genusName (known atlas genus).
// Unmatched names become type 'text' — never reach href construction (T-174-03).
function resolveHostBees(hostBees) {
  if (!hostBees) return null;
  // Split on any comma (not just ", ") and drop empties, so a spacing variation in the
  // seed/mart data can't collapse two hosts into one unresolved token (CR feedback).
  return hostBees
    .split(',')
    .map(name => name.trim())
    .filter(Boolean)
    .map(trimmed => {
      const speciesMatch = byScientificName[trimmed];
      if (speciesMatch && speciesMatch.slug) {
        return { name: trimmed, slug: speciesMatch.slug, type: 'species' };
      }
      const genusMatch = higherTaxaByRankName['genus']?.[trimmed];
      if (genusMatch) {
        return { name: trimmed, genusName: trimmed, type: 'genus' };
      }
      return { name: trimmed, type: 'text' };
    });
}

// Phase 174 (gap closure): build a human-readable specialist host label from the
// Fowler fields. `host_plant_detail` is the rich field — a comma-separated genus
// list, each entry "Genus Author …", optionally prefixed with "Family : ". The
// genus name is reliably the first capitalised word of each comma-separated entry,
// so botanical authorities and parenthetical synonyms are dropped. `host_plant_family`
// is the family. Display contract (chosen 2026-06-29): "Family: genus, genus" when
// both are known, genus-only when no family, family-only when no genera, null when
// neither (e.g. Bee-Gap-sourced specialists carry no host). 44% of Fowler specialists
// have only `host_plant_detail` (no family) — without this they showed a bare
// "Specialist". See species-detail.njk Diet row.
function dietHostLabel(family, detail) {
  let fam = family || null;
  let genera = [];
  if (detail) {
    let rest = detail;
    const colonIdx = detail.indexOf(':');
    if (colonIdx !== -1) {
      const prefix = detail.slice(0, colonIdx).trim();
      if (!fam && prefix) fam = prefix;
      rest = detail.slice(colonIdx + 1);
    }
    genera = rest
      .split(',')
      .map(g => g.trim())
      .map(g => (g.match(/^[A-Z][a-zA-Z-]*/) || [''])[0]) // genus = first capitalised word
      .filter(Boolean);
    genera = [...new Set(genera)];
    // detail that is only the family name (e.g. "Fabaceae") yields no distinct genera
    if (fam && genera.length === 1 && genera[0] === fam) genera = [];
  }
  if (genera.length && fam) return `${fam}: ${genera.join(', ')}`;
  if (genera.length) return genera.join(', ');
  if (fam) return fam;
  return null;
}

for (const sp of flat) {
  sp.resolvedHostBees = resolveHostBees(sp.host_bees);
  // Specialist host label for the detail-page Diet row (null when no host is recorded).
  sp.dietHost = sp.diet_breadth === 'specialist'
    ? dietHostLabel(sp.host_plant_family, sp.host_plant_detail)
    : null;
}

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
// Color indices must be computed over ALL genus members with occurrence_count > 0
// (including unresolved records where specific_epithet is null), matching Python's
// _group_colors input: `WHERE occurrence_count > 0 ORDER BY canonical_name`.
const genusMap = {};
for (const sp of flat) {
  if (!genusMap[sp.genus]) {
    genusMap[sp.genus] = { genus: sp.genus, family: sp.family, subfamily: sp.subfamily, allMembers: [] };
  }
  genusMap[sp.genus].allMembers.push(sp);
}
const genusList = Object.values(genusMap)
  .sort((a, b) => a.genus.localeCompare(b.genus))
  .map(g => {
    // All members with occurrences, sorted by canonical_name — matches Python _group_colors input.
    const withOcc = g.allMembers
      .filter(sp => sp.occurrence_count > 0)
      .sort((a, b) => a.canonical_name.localeCompare(b.canonical_name));
    const n = withOcc.length;
    // Color the genus by SUBGENUS when it has >=2 distinct subgenera among its
    // occurrence-bearing, epithet-bearing members; otherwise keep per-species coloring.
    // This MUST stay byte-identical to data/species_maps.py _generate_group_maps (genus
    // loop): same bucketing rule + same input set, so the page swatch color equals the SVG
    // dot color for every species (swatch<->dot parity, Pitfall 2). The per-subgenus <h2>
    // sections on the genus page act as the legend. Mirrors the subfamily->genus block below,
    // one rank down. Unresolved records (specific_epithet null) get #aaaaaa (Python _UNRESOLVED_COLOR).
    const cleanSubgenus = sp => (sp.subgenus && sp.subgenus.trim() !== '' ? sp.subgenus.trim() : null);
    const distinctSubgenera = [...new Set(
      withOcc
        .filter(sp => sp.specific_epithet !== null && cleanSubgenus(sp))
        .map(sp => cleanSubgenus(sp))
    )].sort();
    let colorByCanon;
    if (distinctSubgenera.length >= 2) {
      // SUBGENUS mode: one hue per subgenus over the sorted distinct-subgenus list.
      const subgenusHex = {};
      for (let i = 0; i < distinctSubgenera.length; i++) {
        subgenusHex[distinctSubgenera[i]] = hslToHex(i * 360 / distinctSubgenera.length, 70, 50);
      }
      colorByCanon = Object.fromEntries(
        withOcc.map(sp => {
          const sg = cleanSubgenus(sp);
          return [
            sp.canonical_name,
            sp.specific_epithet !== null && sg ? subgenusHex[sg] : '#aaaaaa',
          ];
        })
      );
    } else {
      // SPECIES mode (0 or 1 distinct subgenus): one hue per species, unchanged.
      colorByCanon = Object.fromEntries(
        withOcc.map((sp, i) => [
          sp.canonical_name,
          sp.specific_epithet !== null ? hslToHex(i * 360 / n, 70, 50) : '#aaaaaa',
        ])
      );
    }
    // Display species (specific_epithet != null) on the genus page.
    const speciesOnly = withOcc
      .filter(sp => sp.specific_epithet !== null)
      .map(sp => ({ ...sp, hexColor: colorByCanon[sp.canonical_name] }));
    // Checklist-only species (no WABA occurrences, on checklist) get neutral grey.
    // Appended AFTER color index computation so existing WABA hue assignments do not drift.
    const checklistOnly = g.allMembers
      .filter(sp => sp.occurrence_count === 0 && sp.on_checklist && sp.specific_epithet !== null)
      .sort((a, b) => a.canonical_name.localeCompare(b.canonical_name));
    const checklistSpecies = checklistOnly.map(sp => ({ ...sp, hexColor: '#cccccc' }));
    // Append a grey "Genus sp." entry when genus-level records exist, so the
    // key matches the grey dots rendered in the SVG map.
    const unresolvedMembers = withOcc.filter(sp => sp.specific_epithet === null);
    const unresolvedOccurrences = unresolvedMembers.reduce((acc, sp) => acc + sp.occurrence_count, 0);
    const unresolvedSpecimenCount = unresolvedMembers.reduce((acc, sp) => acc + (sp.specimen_count || 0), 0);
    const unresolvedInatObsCount = unresolvedMembers.reduce((acc, sp) => acc + (sp.inat_obs_count || 0), 0);
    // Alphabetical for display: merge occurrence-bearing + checklist-only species and
    // sort by name (they were two separately-sorted runs, so the concatenation looked
    // unsorted on genus/subgenus pages). Color indices stay keyed by canonical_name over
    // `withOcc`, so display order does not affect swatch hues. The synthetic "Genus sp."
    // entry is appended after this sort and remains last.
    const species = [...speciesOnly, ...checklistSpecies]
      .sort((a, b) => a.scientificName.localeCompare(b.scientificName));
    if (unresolvedOccurrences > 0) {
      species.push({ scientificName: `${g.genus} sp.`, hexColor: '#aaaaaa', occurrence_count: unresolvedOccurrences, specimen_count: unresolvedSpecimenCount, inat_obs_count: unresolvedInatObsCount, slug: null });
    }
    // Partition species into subgenus groups + ungrouped (derived from the already-built species array
    // so hexColors and object identity are preserved exactly). The synthetic "Genus sp." entry has no
    // subgenus field and falls into ungroupedSpecies automatically.
    const ungroupedSpecies = species.filter(sp => !sp.subgenus || sp.subgenus.trim() === '');
    const subgenusGroupMap = {};
    for (const sp of species) {
      if (!sp.subgenus || sp.subgenus.trim() === '') continue;
      if (!subgenusGroupMap[sp.subgenus]) subgenusGroupMap[sp.subgenus] = [];
      subgenusGroupMap[sp.subgenus].push(sp);
    }
    const subgenera = Object.entries(subgenusGroupMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([subgenus, sps]) => ({ subgenus, species: sps }));
    return {
      genus: g.genus,
      family: g.family,
      subfamily: g.subfamily,
      species,
      subgenera,
      ungroupedSpecies,
      speciesCount: speciesOnly.length,
      totalOccurrences: speciesOnly.reduce((acc, sp) => acc + sp.occurrence_count, 0) + unresolvedOccurrences,
      taxon_id: higherTaxaByRankName['genus']?.[g.genus]?.taxon_id ?? null,
    };
  });

// Build subgenus groupings. Color indices must be computed over ALL members with
// occurrence_count > 0 (including unresolved records where specific_epithet is null),
// matching Python's _group_colors input: `WHERE occurrence_count > 0 ORDER BY canonical_name`.
// This is the same approach as genusList (Pitfall 1 in 95-RESEARCH.md).
const subgenusMap = {};
for (const sp of flat) {
  if (!sp.subgenus || sp.subgenus.trim() === '') continue;
  const key = `${sp.genus}::${sp.subgenus}`;
  if (!subgenusMap[key]) {
    subgenusMap[key] = {
      genus: sp.genus,
      subgenus: sp.subgenus,
      family: sp.family,
      subfamily: sp.subfamily,
      tribe: sp.tribe,
      allMembers: [],
    };
  }
  subgenusMap[key].allMembers.push(sp);
}
const subgenusList = Object.values(subgenusMap)
  .sort((a, b) => a.genus.localeCompare(b.genus) || a.subgenus.localeCompare(b.subgenus))
  .map(g => {
    // All members with occurrences, sorted by canonical_name — matches Python _group_colors input.
    const withOcc = g.allMembers
      .filter(sp => sp.occurrence_count > 0)
      .sort((a, b) => a.canonical_name.localeCompare(b.canonical_name));
    const n = withOcc.length;
    // Unresolved records (specific_epithet null) get #aaaaaa, matching Python's _UNRESOLVED_COLOR.
    const colorByCanon = Object.fromEntries(
      withOcc.map((sp, i) => [
        sp.canonical_name,
        sp.specific_epithet !== null ? hslToHex(i * 360 / n, 70, 50) : '#aaaaaa',
      ])
    );
    // Display species (specific_epithet != null) on the subgenus page.
    const speciesOnly = withOcc
      .filter(sp => sp.specific_epithet !== null)
      .map(sp => ({ ...sp, hexColor: colorByCanon[sp.canonical_name] }));
    // Checklist-only species (no WABA occurrences, on checklist) get neutral grey.
    // Appended AFTER color index computation so existing WABA hue assignments do not drift.
    const checklistOnly = g.allMembers
      .filter(sp => sp.occurrence_count === 0 && sp.on_checklist && sp.specific_epithet !== null)
      .sort((a, b) => a.canonical_name.localeCompare(b.canonical_name));
    const checklistSpecies = checklistOnly.map(sp => ({ ...sp, hexColor: '#cccccc' }));
    // Append a grey "Subgenus sp." entry when subgenus-level records exist.
    const unresolvedSubgenusMembers = withOcc.filter(sp => sp.specific_epithet === null);
    const unresolvedOccurrences = unresolvedSubgenusMembers.reduce((acc, sp) => acc + sp.occurrence_count, 0);
    const unresolvedSpecimenCount = unresolvedSubgenusMembers.reduce((acc, sp) => acc + (sp.specimen_count || 0), 0);
    const unresolvedInatObsCount = unresolvedSubgenusMembers.reduce((acc, sp) => acc + (sp.inat_obs_count || 0), 0);
    // Alphabetical for display: merge occurrence-bearing + checklist-only species and
    // sort by name (they were two separately-sorted runs, so the concatenation looked
    // unsorted on genus/subgenus pages). Color indices stay keyed by canonical_name over
    // `withOcc`, so display order does not affect swatch hues. The synthetic "Genus sp."
    // entry is appended after this sort and remains last.
    const species = [...speciesOnly, ...checklistSpecies]
      .sort((a, b) => a.scientificName.localeCompare(b.scientificName));
    if (unresolvedOccurrences > 0) {
      species.push({ scientificName: `${g.genus} sp.`, hexColor: '#aaaaaa', occurrence_count: unresolvedOccurrences, specimen_count: unresolvedSpecimenCount, inat_obs_count: unresolvedInatObsCount, slug: null });
    }
    const checklistCount = checklistOnly.reduce((acc, sp) => acc + (sp.checklist_count || 0), 0);
    return {
      genus: g.genus,
      subgenus: g.subgenus,
      family: g.family,
      subfamily: g.subfamily,
      tribe: g.tribe,
      species,
      speciesCount: speciesOnly.length,
      totalOccurrences: withOcc.reduce((acc, sp) => acc + sp.occurrence_count, 0),
      checklistCount,
      taxon_id: higherTaxaByRankName['subgenus']?.[g.subgenus]?.taxon_id ?? null,
    };
  })
  .filter(g => g.totalOccurrences > 0 || g.checklistCount > 0);

// Build tribe groupings. Each tribe lists its genera aggregated by occurrence count.
// Tribes spanning multiple genera aggregate per-genus counts independently.
// All WA tribes are single-family per Data Inventory A1; family captured from first member.
const tribeMap = {};
for (const sp of flat) {
  if (!sp.tribe || sp.tribe.trim() === '') continue;
  if (!tribeMap[sp.tribe]) {
    tribeMap[sp.tribe] = {
      tribe: sp.tribe,
      family: sp.family,  // first encountered is authoritative (all WA tribes are single-family)
      generaMap: {},
    };
  }
  if (!tribeMap[sp.tribe].generaMap[sp.genus]) {
    tribeMap[sp.tribe].generaMap[sp.genus] = { occurrence_count: 0, specimen_count: 0, inat_obs_count: 0 };
  }
  tribeMap[sp.tribe].generaMap[sp.genus].occurrence_count += sp.occurrence_count;
  tribeMap[sp.tribe].generaMap[sp.genus].specimen_count += (sp.specimen_count || 0);
  tribeMap[sp.tribe].generaMap[sp.genus].inat_obs_count += (sp.inat_obs_count || 0);
}
const tribeList = Object.values(tribeMap)
  .sort((a, b) => a.tribe.localeCompare(b.tribe))
  .map(t => {
    const genera = Object.entries(t.generaMap)
      .filter(([, counts]) => counts.occurrence_count > 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([genus, counts]) => ({ genus, ...counts }));
    const totalOccurrences = genera.reduce((acc, g) => acc + g.occurrence_count, 0);
    return {
      tribe: t.tribe,
      family: t.family,
      genera,
      generaCount: genera.length,
      totalOccurrences,
      taxon_id: higherTaxaByRankName['tribe']?.[t.tribe]?.taxon_id ?? null,
    };
  })
  .filter(t => t.totalOccurrences > 0);

// Build subfamilyList: nested tribes→genera structure (D-04) with tribe-less flat fallback (D-05).
// Genus swatch colors match Python _group_colors(sorted unique genera) for SVG map color parity (Pitfall 2, D-06).
// Only subfamilies present in higher_taxa.json (bee subfamilies with members) are included — naturally
// excludes Eumeninae (no bee species → not in higher_taxa.json) per D-08.
const subfamilyRows = (higherTaxaByRankName['subfamily'] && Object.values(higherTaxaByRankName['subfamily'])) || [];
const subfamilyList = subfamilyRows
  .sort((a, b) => a.name.localeCompare(b.name))
  .map(sf => {
    // Collect all genus rows for this subfamily from the rollup
    const genusRows = (higherTaxaByRankName['genus'] && Object.values(higherTaxaByRankName['genus'])) || [];
    const sfGenera = genusRows.filter(g => g.subfamily === sf.name);

    // Compute genus swatch colors: index over sorted unique genera for this subfamily,
    // matching Python _group_colors(sorted(unique_genera)) from Plan 03 (Pitfall 2).
    const sortedGeneraNames = sfGenera.map(g => g.name).sort();
    const n = sortedGeneraNames.length;
    const genusHexColor = {};
    for (let i = 0; i < n; i++) {
      genusHexColor[sortedGeneraNames[i]] = hslToHex(i * 360 / n, 70, 50);
    }

    // Collect tribe rows for this subfamily
    const tribeRows = (higherTaxaByRankName['tribe'] && Object.values(higherTaxaByRankName['tribe'])) || [];
    const sfTribes = tribeRows.filter(t => t.subfamily === sf.name);

    let tribes = [];
    let flatGenera = [];

    if (sfTribes.length > 0) {
      // D-04: nested tribes→genera layout
      tribes = sfTribes
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(t => {
          const tribeGenera = sfGenera
            .filter(g => g.tribe === t.name)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(g => ({
              genus: g.name,
              taxon_id: g.taxon_id,
              specimen_count: g.specimen_count,
              inat_obs_count: g.inat_obs_count,
              occurrence_count: g.occurrence_count,
              hexColor: genusHexColor[g.name],
            }));
          return {
            tribe: t.name,
            taxon_id: t.taxon_id,
            specimen_count: t.specimen_count,
            inat_obs_count: t.inat_obs_count,
            genera: tribeGenera,
          };
        });
    } else {
      // D-05: tribe-less subfamilies → flat genus list with no tribe heading
      flatGenera = sfGenera
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(g => ({
          genus: g.name,
          taxon_id: g.taxon_id,
          specimen_count: g.specimen_count,
          inat_obs_count: g.inat_obs_count,
          occurrence_count: g.occurrence_count,
          hexColor: genusHexColor[g.name],
        }));
    }

    const tribesCount = tribes.length;
    const generaCount = sfGenera.length;
    const totalOccurrences = sf.occurrence_count;

    return {
      subfamily: sf.name,
      family: sf.family,
      taxon_id: sf.taxon_id,
      specimen_count: sf.specimen_count,
      inat_obs_count: sf.inat_obs_count,
      species_count: sf.species_count,
      tribesCount,
      generaCount,
      totalOccurrences,
      tribes,
      genera: flatGenera,
    };
  });

// Phase 133 Plan 01 — D-10: Build the full nested taxonomy tree for _pages/species.njk.
// Produces fullTree: array of family nodes, each with children nested up to six ranks:
//   family → subfamily → tribe → genus → subgenus → species
// D-05 graceful degradation: ranks without members are skipped; children attach to nearest
// present ancestor (no empty wrapper nodes, no "Other" bucket).
// D-08: counts sourced from higherTaxaByRankName (pre-rolled totals), not recomputed.
// D-06: every subgenus node carries genusName = row.genus (the genus parent name, not subgenus name).
// TREE-04: bee-only (higherTaxaByRankName is already bee-only; excludes Eumeninae naturally).

function buildFullTree() {
  // Index species leaves by genus and subgenus for efficient lookup.
  // Only species with specific_epithet (real species, no unresolved genus-level records).
  const speciesByGenus = {};  // genus → [speciesRow, ...]
  const speciesBySubgenus = {};  // `${genus}::${subgenus}` → [speciesRow, ...]
  for (const sp of flat) {
    if (sp.specific_epithet === null) continue;
    if (!speciesByGenus[sp.genus]) speciesByGenus[sp.genus] = [];
    speciesByGenus[sp.genus].push(sp);
    if (sp.subgenus && sp.subgenus.trim() !== '') {
      const key = `${sp.genus}::${sp.subgenus}`;
      if (!speciesBySubgenus[key]) speciesBySubgenus[key] = [];
      speciesBySubgenus[key].push(sp);
    }
  }

  // Build species leaf node from a species row.
  function makeSpeciesNode(sp) {
    return {
      rank: 'species',
      name: sp.scientificName,
      taxon_id: sp.taxon_id ?? null,
      specimen_count: sp.specimen_count ?? 0,
      inat_obs_count: sp.inat_obs_count ?? 0,
      occurrence_count: sp.occurrence_count ?? 0,
      slug: sp.slug,
      scientificName: sp.scientificName,
      // Phase 174 D-07: trait badge fields for species index leaf nodes.
      // null-coalesced so keys are always present even when species.json predates 174-01.
      sociality: sp.sociality ?? null,
      sociality_source: sp.sociality_source ?? null,
      diet_breadth: sp.diet_breadth ?? null,
      diet_breadth_source: sp.diet_breadth_source ?? null,
      host_plant_family: sp.host_plant_family ?? null,
      children: [],
    };
  }

  // Build genus node: children are subgenus nodes (D-05: if subgenus rows exist for this genus)
  // or species leaves directly (when no subgenus rows exist).
  function makeGenusNode(genusRow) {
    const genusName = genusRow.name;
    const subgenusRows = (higherTaxaByRankName['subgenus']
      ? Object.values(higherTaxaByRankName['subgenus']).filter(r => r.genus === genusName)
      : []);

    let children;
    if (subgenusRows.length > 0) {
      // Genus has subgenus rows: nest species under their subgenus.
      // D-05: any species without a subgenus would attach directly to genus — but all species
      // that belong to a genus with subgenus rows do carry a subgenus per the data invariant.
      children = subgenusRows
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(sgRow => {
          const key = `${genusName}::${sgRow.name}`;
          const sgSpecies = (speciesBySubgenus[key] || [])
            .sort((a, b) => a.scientificName.localeCompare(b.scientificName))
            .map(makeSpeciesNode);
          return {
            rank: 'subgenus',
            name: sgRow.name,
            // D-06: genusName is the genus PARENT name — from row.genus (not row.name).
            // Plan 02 builds /species/{genusName}/{name}/ from this field.
            genusName: sgRow.genus,
            taxon_id: sgRow.taxon_id ?? null,
            specimen_count: sgRow.specimen_count ?? 0,
            inat_obs_count: sgRow.inat_obs_count ?? 0,
            occurrence_count: sgRow.occurrence_count ?? 0,
            children: sgSpecies,
          };
        });
      // D-05: also include species with no subgenus (subgenus field null/empty) directly.
      const directSpecies = (speciesByGenus[genusName] || [])
        .filter(sp => !sp.subgenus || sp.subgenus.trim() === '')
        .sort((a, b) => a.scientificName.localeCompare(b.scientificName))
        .map(makeSpeciesNode);
      children = [...children, ...directSpecies];
    } else {
      // No subgenus rows: attach species directly to genus (D-05 — no empty intermediate node).
      children = (speciesByGenus[genusName] || [])
        .sort((a, b) => a.scientificName.localeCompare(b.scientificName))
        .map(makeSpeciesNode);
    }

    return {
      rank: 'genus',
      name: genusName,
      taxon_id: genusRow.taxon_id ?? null,
      specimen_count: genusRow.specimen_count ?? 0,
      inat_obs_count: genusRow.inat_obs_count ?? 0,
      occurrence_count: genusRow.occurrence_count ?? 0,
      children,
    };
  }

  // Collect all genus rows (already bee-only).
  const allGenusRows = (higherTaxaByRankName['genus'] && Object.values(higherTaxaByRankName['genus'])) || [];
  // Collect all tribe rows.
  const allTribeRows = (higherTaxaByRankName['tribe'] && Object.values(higherTaxaByRankName['tribe'])) || [];
  // Collect all subfamily rows.
  const allSubfamilyRows = (higherTaxaByRankName['subfamily'] && Object.values(higherTaxaByRankName['subfamily'])) || [];

  // Determine which families are present (from genus rows — all bee families).
  const familyNames = [...new Set(allGenusRows.map(r => r.family))].sort();

  return familyNames.map(familyName => {
    // Collect subfamily rows for this family.
    const sfRows = allSubfamilyRows.filter(sf => sf.family === familyName);

    let familyChildren;

    if (sfRows.length > 0) {
      // Build subfamily → (tribe →) genus → subgenus → species chain.
      familyChildren = sfRows
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(sfRow => {
          // Collect tribe rows for this subfamily.
          const sfTribeRows = allTribeRows.filter(t => t.subfamily === sfRow.name);
          // Genus rows for this subfamily.
          const sfGenusRows = allGenusRows.filter(g => g.subfamily === sfRow.name);

          let sfChildren;
          if (sfTribeRows.length > 0) {
            // D-04: subfamily has tribes → nested tribes→genera chain.
            sfChildren = sfTribeRows
              .sort((a, b) => a.name.localeCompare(b.name))
              .map(tRow => {
                const tribeGenusRows = sfGenusRows
                  .filter(g => g.tribe === tRow.name)
                  .sort((a, b) => a.name.localeCompare(b.name));
                const tribeChildren = tribeGenusRows.map(makeGenusNode);
                return {
                  rank: 'tribe',
                  name: tRow.name,
                  taxon_id: tRow.taxon_id ?? null,
                  specimen_count: tRow.specimen_count ?? 0,
                  inat_obs_count: tRow.inat_obs_count ?? 0,
                  occurrence_count: tRow.occurrence_count ?? 0,
                  children: tribeChildren,
                };
              });
            // D-05: genera with no tribe (tribe field null/empty) attach directly to subfamily.
            const tribelessGenera = sfGenusRows
              .filter(g => !g.tribe || g.tribe.trim() === '')
              .sort((a, b) => a.name.localeCompare(b.name))
              .map(makeGenusNode);
            sfChildren = [...sfChildren, ...tribelessGenera];
          } else {
            // D-05: tribe-less subfamily → flat genus list directly under subfamily.
            sfChildren = sfGenusRows
              .sort((a, b) => a.name.localeCompare(b.name))
              .map(makeGenusNode);
          }

          // Compute family-level counts by summing subfamily counts (already available on sfRow).
          return {
            rank: 'subfamily',
            name: sfRow.name,
            taxon_id: sfRow.taxon_id ?? null,
            specimen_count: sfRow.specimen_count ?? 0,
            inat_obs_count: sfRow.inat_obs_count ?? 0,
            occurrence_count: sfRow.occurrence_count ?? 0,
            children: sfChildren,
          };
        });

      // D-05: genera that belong to this family but have no matching subfamily row
      // (should not occur in practice with current bee-only data, but guard anyway).
      const orphanGenera = allGenusRows
        .filter(g => g.family === familyName && !sfRows.some(sf => sf.name === g.subfamily))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(makeGenusNode);
      familyChildren = [...familyChildren, ...orphanGenera];
    } else {
      // No subfamily rows for this family — attach genera directly to family (D-05).
      familyChildren = allGenusRows
        .filter(g => g.family === familyName)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(makeGenusNode);
    }

    // Family counts: sum from subfamily rows (D-08 — descendant-based).
    const familySpecimenCount = sfRows.reduce((acc, sf) => acc + (sf.specimen_count ?? 0), 0)
      || allGenusRows.filter(g => g.family === familyName).reduce((acc, g) => acc + (g.specimen_count ?? 0), 0);
    const familyInatObsCount = sfRows.reduce((acc, sf) => acc + (sf.inat_obs_count ?? 0), 0)
      || allGenusRows.filter(g => g.family === familyName).reduce((acc, g) => acc + (g.inat_obs_count ?? 0), 0);
    const familyOccurrenceCount = sfRows.reduce((acc, sf) => acc + (sf.occurrence_count ?? 0), 0)
      || allGenusRows.filter(g => g.family === familyName).reduce((acc, g) => acc + (g.occurrence_count ?? 0), 0);

    return {
      rank: 'family',
      name: familyName,
      taxon_id: null,  // no family rows in higher_taxa.json; taxon_id not available
      specimen_count: familySpecimenCount,
      inat_obs_count: familyInatObsCount,
      occurrence_count: familyOccurrenceCount,
      children: familyChildren,
    };
  });
}

const fullTree = buildFullTree();

// Mark which subgenus/tribe cross-links resolve to a generated page. The tree (fullTree),
// genus pages, and subfamily pages link every subgenus/tribe present in the taxonomy rollup
// (higher_taxa.json), but subgenusList/tribeList only generate pages for taxa with content
// (occurrences, or checklist members). Checklist-only taxa with zero occurrences and no
// checklist_count (e.g. Hoplitis/Proteriades, Lasioglossum/Evylaeus, tribe Ammobatini) are
// linked but ungenerated → broken internal links. Tag each cross-link target so templates can
// render plain text instead of a dead <a>. Self-healing: once a taxon gains occurrences it
// re-enters the generated list and the link returns. Derived from the final generated lists
// (single source of truth — stays in sync if the filters change).
const generatedSubgenusKeys = new Set(subgenusList.map((s) => `${s.genus}::${s.subgenus}`));
const generatedTribeNames = new Set(tribeList.map((t) => t.tribe));

for (const g of genusList) {
  for (const sg of g.subgenera) {
    sg.hasPage = generatedSubgenusKeys.has(`${g.genus}::${sg.subgenus}`);
  }
}
for (const sf of subfamilyList) {
  for (const t of sf.tribes) {
    t.hasPage = generatedTribeNames.has(t.tribe);
  }
}
(function tagTree(nodes) {
  for (const node of nodes) {
    if (node.rank === 'subgenus') node.hasPage = generatedSubgenusKeys.has(`${node.genusName}::${node.name}`);
    else if (node.rank === 'tribe') node.hasPage = generatedTribeNames.has(node.name);
    if (node.children) tagTree(node.children);
  }
})(fullTree);

export default { flat, byScientificName, counties, ecoregionL3, speciesList, genusList, subgenusList, tribeList, subfamilyList, fullTree };

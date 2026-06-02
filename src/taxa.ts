// Pure taxa helpers — D-03 label scheme, D-05 ordering, D-01 enumeration.
// No module-level mutable state (architecture invariant).

import type { TaxonOption } from './filter.ts';

/** D-05: rank order for autocomplete sorting — broader ranks first */
export const RANK_ORDER: Record<string, number> = {
  family: 0,
  subfamily: 1,
  tribe: 2,
  subtribe: 3,
  genus: 4,
  subgenus: 5,
  complex: 6,
  species: 7,
};

/** D-03: label scheme for taxon autocomplete entries */
export function buildTaxonLabel(name: string, rank: string): string {
  if (rank === 'genus') return `${name} (genus)`;
  if (rank === 'subgenus') return `${name} (subgenus)`;
  if (rank === 'complex') return `${name} complex`;
  // family, subfamily, tribe, subtribe, species — plain name
  return name;
}

export type TaxonCacheEntry = { rank: string; name: string; lineagePath: string | null };

/**
 * D-01 enumeration: build the eligible autocomplete set.
 *
 * Strategy: start from the distinct taxon_ids present in occurrences, then for
 * each present taxon walk its lineage_path to include all is_anthophila=1 ancestors.
 * Bycatch (is_anthophila=0) are absent from taxonCache by construction — excluded
 * automatically. Dead-end anthophila taxa (no descendant occurrence) are excluded
 * because they are never reached by this walk.
 *
 * Returns a sorted TaxonOption[] with D-03 labels and D-05 ordering applied.
 */
export function buildTaxonOptions(
  presentIds: Set<number>,
  taxonCache: Map<number, TaxonCacheEntry>,
): TaxonOption[] {
  const eligible = new Set<number>();

  for (const taxonId of presentIds) {
    const entry = taxonCache.get(taxonId);
    if (!entry) continue; // bycatch (not in is_anthophila=1 cache) — skip

    // Add the present taxon itself
    eligible.add(taxonId);

    // Walk lineage_path to add all is_anthophila=1 ancestors.
    // lineage_path format: '/1/2/3/' — split on '/', parse integers, skip empty strings.
    if (entry.lineagePath) {
      for (const segment of entry.lineagePath.split('/')) {
        if (!segment) continue;
        const ancestorId = parseInt(segment, 10);
        if (isNaN(ancestorId)) continue;
        if (taxonCache.has(ancestorId)) {
          eligible.add(ancestorId);
        }
      }
    }
  }

  // Build TaxonOption[] from eligible set
  const options: TaxonOption[] = [];
  for (const taxonId of eligible) {
    const entry = taxonCache.get(taxonId)!;
    options.push({
      taxonId,
      rank: entry.rank as TaxonOption['rank'],
      label: buildTaxonLabel(entry.name, entry.rank),
      // Store the plain name for sort purposes (sort uses label, but name is cleaner)
    });
  }

  // D-05 ordering: broader rank first, then alphabetical by name within rank
  options.sort((a, b) => {
    const rankDiff = (RANK_ORDER[a.rank] ?? 99) - (RANK_ORDER[b.rank] ?? 99);
    if (rankDiff !== 0) return rankDiff;
    return a.label.localeCompare(b.label);
  });

  return options;
}

// Occurrence domain: ID construction, ID parsing, type predicates.
// Single owner of the `ecdysis:` / `inat:` ID prefix vocabulary.
//
// All functions are pure: they read only from their arguments and have
// no module-level mutable state. No imports other than the OccurrenceRow
// type from filter.ts.
//
// Plan 02 (Wave 2) migrates all call sites to use these functions.
// See also: src/url-state.ts for the analogous URL-domain pure-function module.

import type { OccurrenceRow } from './filter.ts';

/**
 * Construct a prefixed occurrence ID from a row.
 *
 * Returns `'ecdysis:N'` when the row has an Ecdysis specimen record,
 * `'inat:N'` when it has an iNaturalist observation but no Ecdysis record,
 * or `null` when both IDs are null (e.g. provisional rows with no observation_id).
 *
 * The `string | null` return type matches the existing `rowOccId` contract
 * in `src/bee-table.ts` — callers retain their existing null-check logic.
 */
export function occIdFromRow(row: OccurrenceRow): string | null {
  if (row.ecdysis_id != null) return `ecdysis:${row.ecdysis_id}`;
  if (row.observation_id != null) return `inat:${row.observation_id}`;
  if (row.specimen_observation_id != null) return `inat_obs:${row.specimen_observation_id}`;
  // Phase 137 (PRO-04): checklist rows carry only checklist_id (all three above are null).
  if (row.checklist_id != null) return `checklist:${row.checklist_id}`;
  return null;
}

/**
 * Parse a prefixed occurrence ID into its source and numeric ID.
 *
 * Returns `{ source: 'ecdysis' | 'inat', numericId: number }` for
 * well-formed IDs, or `null` for any malformed input (wrong prefix,
 * non-numeric suffix, empty string).
 */
export function parseOccId(id: string): { source: 'ecdysis' | 'inat' | 'inat_obs' | 'checklist'; numericId: number } | null {
  if (id.startsWith('ecdysis:')) {
    const n = parseInt(id.slice('ecdysis:'.length), 10);
    return isNaN(n) ? null : { source: 'ecdysis', numericId: n };
  }
  if (id.startsWith('inat_obs:')) {
    const n = parseInt(id.slice('inat_obs:'.length), 10);
    return isNaN(n) ? null : { source: 'inat_obs', numericId: n };
  }
  if (id.startsWith('inat:')) {
    const n = parseInt(id.slice('inat:'.length), 10);
    return isNaN(n) ? null : { source: 'inat', numericId: n };
  }
  // Phase 138 (UIX-01): checklist points are now clickable real points, so a
  // checklist:N selection must reach the list/table query path, not be dropped.
  if (id.startsWith('checklist:')) {
    const n = parseInt(id.slice('checklist:'.length), 10);
    return isNaN(n) ? null : { source: 'checklist', numericId: n };
  }
  return null;
}

/**
 * True when the occurrence has an Ecdysis specimen record.
 *
 * This is the canonical "confirmed specimen" predicate across all layers:
 * - TypeScript: `row.ecdysis_id != null`  (this function)
 * - Python:     `CASE WHEN ecdysis_id IS NOT NULL THEN 1 END`  (places_export.py `_query_counts`)
 * - dbt SQL:    `int_species_occurrences_agg` counts ecdysis_data.occurrences directly
 *
 * Do NOT use `!row.is_provisional` as a synonym — `is_provisional = false` is true
 * for both Ecdysis-backed rows AND sample-only iNat rows (ecdysis_id == null).
 * Authoritative layer: this function. Other layers must agree with this definition.
 */
export function isSpecimenBacked(row: OccurrenceRow): boolean {
  return row.ecdysis_id != null;
}

/**
 * True when the occurrence is an iNat-only sample with no Ecdysis record
 * and is not a provisional WABA record.
 *
 * Deliberately excludes provisional rows: `ecdysis_id == null` captures
 * both sample-only and provisional rows; this predicate narrows to the
 * sample-only subset. Use `isProvisional` to dispatch the provisional case.
 */
export function isSampleOnly(row: OccurrenceRow): boolean {
  return row.ecdysis_id == null && !row.is_provisional;
}

/**
 * True when the occurrence is a provisional WABA iNat record awaiting
 * an Ecdysis specimen match.
 */
export function isProvisional(row: OccurrenceRow): boolean {
  return row.is_provisional;
}

/**
 * True when the occurrence ID string identifies an Ecdysis specimen record.
 *
 * Use this helper when operating on already-constructed ID strings
 * (e.g. feature properties) to avoid restating the `'ecdysis:'` literal
 * at the call site.
 */
export function isSpecimenId(occId: string): boolean {
  return occId.startsWith('ecdysis:');
}

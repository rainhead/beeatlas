// Fixture builders for the /design proofing surface (ADR 0039).
//
// The presenters proofed at /design are pure functions of their properties, so
// every state they can be in is reachable by constructing props — no database,
// no map, no network. That is what lets the proofs live on a static page, and
// it is the property to protect: a state that needs data gymnastics to reach is
// a component that has stopped being a presenter.
//
// These builders are shared with the unit tests rather than duplicated there.
// The defaults are therefore deliberately boring — a determinate Ecdysis
// specimen with nothing optional set — and each proof state says what it is by
// what it OVERRIDES. Changing a default changes both surfaces at once, which is
// the point: a field the tests treat as absent should be absent here too.

import type { OccurrenceRow, MemberPlace } from '../filter.ts';
import type { TaxonCacheEntry } from '../taxa.ts';

/**
 * One occurrence row, with every field the detail card reads.
 *
 * Written out in full rather than cast from a partial: the row type is the
 * contract with `marts/occurrences`, and a fixture that quietly omits a column
 * would let a card render green against a shape the database cannot produce.
 */
export function occurrenceRow(over: Partial<OccurrenceRow> = {}): OccurrenceRow {
  const row: OccurrenceRow = {
    taxon_id: null, lat: 47.6, lon: -122.3, date: '2024-06-01',
    county: null, ecoregion_l3: null, ecdysis_id: 1, catalog_number: null,
    recordedBy: 'A. Collector', fieldNumber: null, floralHost: null,
    host_observation_id: null, inat_host: null, inat_quality_grade: null,
    modified: null, specimen_observation_id: null, elevation_m: null,
    elevation_dem_m: null, year: 2024, month: 6, observation_id: null,
    host_inat_login: null, is_provisional: false,
    specimen_inat_quality_grade: null, specimen_count: null, sample_id: null,
    sample_host: null, checklist_id: null, verbatim_name: null, locality: null,
    collapsed_count: null, tier: 'atlas', record_type: 'specimen',
    image_url: null, obs_url: null, user_login: null, license: null,
    collector_inat_login: null, display_name: null, display_rank: null,
    ...over,
  };
  // Mirror the pipeline's host-first COALESCE (int_combined) unless the fixture
  // states the login outright — as the waba_specimen arm must, since it sets
  // neither host_inat_login nor user_login and still names a person. A fixture
  // that contradicted that COALESCE would proof attribution the mart cannot emit.
  return {
    ...row,
    collector_inat_login: row.collector_inat_login ?? row.host_inat_login ?? row.user_login,
  };
}

/**
 * The five record_type card variants, as the rows that select them.
 *
 * `is_provisional` is checked FIRST by the card dispatch, so the provisional
 * builder sets it rather than relying on record_type alone — the two must agree
 * or the fixture proofs a combination the pipeline never emits.
 */
export const rows = {
  specimen: (over: Partial<OccurrenceRow> = {}) => occurrenceRow(over),
  sampleOnly: (over: Partial<OccurrenceRow> = {}) => occurrenceRow({
    ecdysis_id: null, observation_id: 218228643, record_type: null,
    specimen_count: 3, ...over,
  }),
  provisional: (over: Partial<OccurrenceRow> = {}) => occurrenceRow({
    ecdysis_id: null, observation_id: 218228644, is_provisional: true,
    record_type: 'provisional_sample', ...over,
  }),
  wabaSpecimen: (over: Partial<OccurrenceRow> = {}) => occurrenceRow({
    ecdysis_id: null, specimen_observation_id: 218228645,
    record_type: 'waba_specimen', ...over,
  }),
  inatExpert: (over: Partial<OccurrenceRow> = {}) => occurrenceRow({
    ecdysis_id: null, specimen_observation_id: 218228646,
    record_type: 'inat_expert', tier: 'other', ...over,
  }),
  checklist: (over: Partial<OccurrenceRow> = {}) => occurrenceRow({
    ecdysis_id: null, checklist_id: 4471, record_type: 'checklist',
    tier: 'other', recordedBy: 'W. Bartholomew', ...over,
  }),
};

/** Places, as the bridge resolves them: a slug that has a page, and a name. */
export const places = {
  klickitatTrail: { slug: 'klickitat-trail', name: 'Klickitat Trail' },
  westernCascades: {
    slug: '4a-western-cascades-lowlands-and-valleys',
    name: '4a. Western Cascades Lowlands and Valleys',
  },
  pleistoceneLakeBasins: {
    slug: '10e-pleistocene-lake-basins',
    name: '10e. Pleistocene Lake Basins',
  },
} satisfies Record<string, MemberPlace>;

/** Membership keyed the way <bee-occurrence-detail> reads it: occId → places. */
export function membership(
  entries: ReadonlyArray<readonly [string, MemberPlace[]]>,
): Map<string, MemberPlace[]> {
  return new Map(entries);
}

/** Resolved taxon names, as <bee-atlas> hands them down. */
export function taxonCache(
  entries: ReadonlyArray<readonly [number, string]>,
): Map<number, TaxonCacheEntry> {
  return new Map(entries.map(([id, name]) => [id, { rank: 'species', name, lineagePath: null }]));
}

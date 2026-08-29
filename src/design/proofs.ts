// The states each section of /design proofs (ADR 0039).
//
// A section is a list of states; a state builds the component under proof and
// hands it back. Nothing here touches the document, the network, or the SQL
// worker — the page entry does the mounting, and the test mounts the same list
// under happy-dom. That is what keeps the proofs honest: if a state can only be
// reached by driving the app, it does not belong here, and the component that
// needs it has stopped being a presenter.
//
// Section slugs match _data/design.js. A test asserts the two lists agree, so a
// section cannot be listed with nothing to show, or shown without being listed.

import type { FilterState, MemberPlace, OccurrenceRow } from '../filter.ts';
import type { TaxonCacheEntry } from '../taxa.ts';
import { membership, places, rows, taxonCache } from './fixtures.ts';
import '../bee-occurrence-detail.ts';

export interface ProofState {
  /** Stable within a section; used as the frame's anchor so a state is linkable. */
  id: string;
  label: string;
  /** What this state is for — why it is worth looking at, not what it contains. */
  note?: string;
  /**
   * This state's whole point is that the component renders nothing. The frame
   * says so rather than showing an empty box, and the test asserts emptiness
   * instead of content — otherwise "renders nothing" and "is broken" look the
   * same on the page and neither is caught.
   */
  expectsEmpty?: boolean;
  /** Build the component under proof. Called once per mount; no side effects. */
  render(): HTMLElement;
}

function detail(props: {
  occurrences: OccurrenceRow[];
  memberPlaces?: Map<string, MemberPlace[]>;
  taxonCache?: Map<number, TaxonCacheEntry>;
}): HTMLElement {
  const el = document.createElement('bee-occurrence-detail') as HTMLElement & {
    occurrences: OccurrenceRow[];
    memberPlaces: Map<string, MemberPlace[]> | null;
    taxonCache: Map<number, TaxonCacheEntry> | null;
    filterState: FilterState | null;
  };
  el.occurrences = props.occurrences;
  el.memberPlaces = props.memberPlaces ?? null;
  el.taxonCache = props.taxonCache ?? null;
  // Left null on purpose. The record menu's "Filter for this species" button
  // renders either way — only ACTING on it needs a filter state — and importing
  // the real emptyFilterState() would pull filter.ts, and with it the inlined
  // wa-sqlite worker, into a page that must not carry a data layer. So the
  // button proofs visually here and does nothing when clicked.
  el.filterState = null;
  return el;
}

const OSMIA = 1;
const AGAPOSTEMON = 2;
const NAMES = taxonCache([[OSMIA, 'Osmia lignaria'], [AGAPOSTEMON, 'Agapostemon subtilior']]);

// A stand-in photo, inline. The iNat arm needs an <img> that resolves, and a
// proofing page must not depend on a third-party host being up — but it also
// must not proof a blank: the image is object-fit:cover at up to 200px, so a
// 1×1 transparent pixel would show the layout as an empty hole rather than as
// the picture it will be.
const PHOTO = 'data:image/svg+xml;utf8,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">
     <rect width="400" height="300" fill="#c9d6c2"/>
     <circle cx="200" cy="150" r="60" fill="#8ea587"/>
     <text x="200" y="285" font-family="sans-serif" font-size="18" fill="#4d5a48"
       text-anchor="middle">stand-in photo</text>
   </svg>`);

const OCCURRENCE_DETAIL: ProofState[] = [
  {
    id: 'one-event',
    label: 'One collecting event',
    note: 'The common case: a point selected on the map. Every record shares the ecoregion, so it is stated once on the date line rather than repeated per species.',
    render: () => detail({
      occurrences: [
        rows.specimen({ ecdysis_id: 1, taxon_id: OSMIA, recordedBy: 'S. Haigh', floralHost: 'Ribes sanguineum' }),
        rows.specimen({ ecdysis_id: 2, taxon_id: OSMIA, recordedBy: 'S. Haigh', floralHost: 'Ribes sanguineum' }),
        rows.specimen({ ecdysis_id: 3, taxon_id: AGAPOSTEMON, recordedBy: 'S. Haigh' }),
      ],
      memberPlaces: membership([
        ['ecdysis:1', [places.westernCascades]],
        ['ecdysis:2', [places.westernCascades]],
        ['ecdysis:3', [places.westernCascades]],
      ]),
      taxonCache: NAMES,
    }),
  },
  {
    id: 'site-within-ecoregion',
    label: 'A named site inside the shared ecoregion',
    note: 'What one record adds beyond the shared set stays a chip on that record. This is the only state where both treatments appear at once.',
    render: () => detail({
      occurrences: [
        rows.specimen({ ecdysis_id: 1, taxon_id: OSMIA, recordedBy: 'S. Haigh' }),
        rows.specimen({ ecdysis_id: 2, taxon_id: OSMIA, recordedBy: 'S. Haigh' }),
      ],
      memberPlaces: membership([
        ['ecdysis:1', [places.klickitatTrail, places.westernCascades]],
        ['ecdysis:2', [places.westernCascades]],
      ]),
      taxonCache: NAMES,
    }),
  },
  {
    id: 'spanning-ecoregions',
    label: 'A selection spanning two ecoregions',
    note: 'Nothing is shared, so nothing is claimed on the date line and every record carries its own chip. The bbox-selection case.',
    render: () => detail({
      occurrences: [
        rows.specimen({ ecdysis_id: 1, taxon_id: OSMIA, date: '2024-06-01' }),
        rows.specimen({ ecdysis_id: 2, taxon_id: AGAPOSTEMON, date: '2024-06-04' }),
      ],
      memberPlaces: membership([
        ['ecdysis:1', [places.westernCascades]],
        ['ecdysis:2', [places.pleistoceneLakeBasins]],
      ]),
      taxonCache: NAMES,
    }),
  },
  {
    id: 'membership-unresolved',
    label: 'Membership not resolved',
    note: 'An older cached DB has no occurrence_places bridge, and the first paint runs before the resolution lands. Neither may invent a location.',
    render: () => detail({
      occurrences: [rows.specimen({ ecdysis_id: 1, taxon_id: OSMIA })],
      taxonCache: NAMES,
    }),
  },
  {
    id: 'two-collectors',
    label: 'Two collectors, one date',
    note: 'Why the date and the collector are separate headers: a date group holds one group per collector.',
    render: () => detail({
      occurrences: [
        rows.specimen({ ecdysis_id: 1, taxon_id: OSMIA, recordedBy: 'S. Haigh' }),
        rows.specimen({ ecdysis_id: 2, taxon_id: AGAPOSTEMON, recordedBy: 'D. Wilson' }),
        rows.specimen({ ecdysis_id: 3, taxon_id: null, recordedBy: null }),
      ],
      taxonCache: NAMES,
    }),
  },
  {
    id: 'no-determination',
    label: 'Undetermined specimen',
    note: 'A catalogued specimen with no determination — not an error state, just the backlog. The record menu loses its filter action, having no taxon to filter to.',
    render: () => detail({
      occurrences: [rows.specimen({ ecdysis_id: 1, taxon_id: null, recordedBy: 'S. Haigh' })],
      taxonCache: NAMES,
    }),
  },
  {
    id: 'sample-only',
    label: 'Sample awaiting identification',
    note: 'A collecting event from iNaturalist with specimens counted but nothing yet catalogued in Ecdysis.',
    render: () => detail({
      occurrences: [rows.sampleOnly({
        host_inat_login: 'shaigh', sample_host: 'Ribes sanguineum', specimen_count: 12,
        obs_url: 'https://www.inaturalist.org/observations/218228643',
      })],
    }),
  },
  {
    id: 'provisional',
    label: 'Provisional record',
    note: 'A WABA sample identified on iNaturalist, awaiting its Ecdysis match. Its iNat identification is shown with the quality grade that qualifies it.',
    render: () => detail({
      occurrences: [rows.provisional({
        taxon_id: OSMIA, display_name: 'Osmia lignaria', specimen_inat_quality_grade: 'needs_id',
        host_inat_login: 'shaigh', specimen_count: 2,
      })],
      taxonCache: NAMES,
    }),
  },
  {
    id: 'waba-specimen',
    label: 'Awaiting Ecdysis catalogue entry',
    note: 'Attributed by iNat login alone: this arm sets neither recordedBy nor user_login, so the only name it has is the collector login the pipeline resolved. The "@" marks it as a handle rather than a person\u2019s name.',
    render: () => detail({
      occurrences: [rows.wabaSpecimen({
        taxon_id: OSMIA, collector_inat_login: 'mylodon',
        specimen_inat_quality_grade: 'research',
      })],
      taxonCache: NAMES,
    }),
  },
  {
    id: 'inat-expert-photo',
    label: 'Community observation, CC-licensed photo',
    note: 'The photo renders only for a CC licence; the same record under an all-rights-reserved licence must render text-only.',
    render: () => detail({
      occurrences: [
        rows.inatExpert({
          specimen_observation_id: 1, taxon_id: AGAPOSTEMON, user_login: 'naturalist',
          inat_quality_grade: 'research', license: 'CC-BY-NC', image_url: PHOTO,
          floralHost: 'Symphyotrichum subspicatum',
        }),
        rows.inatExpert({
          specimen_observation_id: 2, taxon_id: AGAPOSTEMON, user_login: 'naturalist',
          inat_quality_grade: 'casual', license: null, image_url: PHOTO,
        }),
      ],
      taxonCache: NAMES,
    }),
  },
  {
    id: 'checklist',
    label: 'Checklist record',
    note: 'A literature record: no date precision beyond the year, a verbatim name that differs from the accepted one, and several identical records collapsed into it.',
    render: () => detail({
      occurrences: [rows.checklist({
        taxon_id: AGAPOSTEMON, verbatim_name: 'Agapostemon texanus', date: '1987',
        locality: 'Klickitat Co.', collapsed_count: 4,
      })],
      taxonCache: NAMES,
    }),
  },
  {
    id: 'mixed',
    label: 'Specimens and other records together',
    note: 'The rule between the two halves only appears when both are present — the state that regressed when the separator was introduced.',
    render: () => detail({
      occurrences: [
        rows.specimen({ ecdysis_id: 1, taxon_id: OSMIA, recordedBy: 'S. Haigh' }),
        rows.sampleOnly({ observation_id: 9, specimen_count: 4, host_inat_login: 'shaigh' }),
        rows.checklist({ taxon_id: AGAPOSTEMON, date: '1987', locality: 'Klickitat Co.' }),
      ],
      taxonCache: NAMES,
    }),
  },
  {
    id: 'empty',
    label: 'Nothing selected',
    note: 'The component renders nothing at all; the surrounding pane owns the "click a point" hint, and must keep owning it.',
    expectsEmpty: true,
    render: () => detail({ occurrences: [] }),
  },
];

export const PROOFS: Record<string, readonly ProofState[]> = {
  'occurrence-detail': OCCURRENCE_DETAIL,
};

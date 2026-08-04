// The pure half of header search (beeatlas-7nx.2, ADR 0028).
//
// No DOM, no SQL, no Lit. <bee-atlas> owns the corpora and assembles the sources;
// this module turns them into an index and ranks a query against it. Keeping it
// pure is what lets the ranking rules be tested without mounting anything, and what
// lets matching run on every keystroke — the whole index is in memory, so a query
// costs a scan over a few thousand short strings and never touches wa-sqlite.
//
// A CANDIDATE IS DECLARATIVE DATA, NEVER A CLOSURE. It crosses a property boundary
// into <bee-header>, which is a pure presenter (ADR 0021) and must not carry
// behaviour. The union below names the thing; <bee-atlas> owns the one switch that
// decides what naming it does to FilterState.

import { parseCatalogSuffix, type CollectorEntry } from './filter.ts';
import type { TaxonCacheEntry } from './taxa.ts';

export type SearchKind = 'label' | 'taxon' | 'person' | 'place' | 'county' | 'ecoregion';

interface CandidateBase {
  /** Stable identity for keyed rendering and for tests. `<kind>:<payload>`. */
  key: string;
  /** The row's primary text. For a taxon this is the pane's label ("Bombus (genus)"). */
  label: string;
  /**
   * Secondary text — DATA, not prose. The presenter phrases a row from `kind`;
   * this carries the extra fact worth showing (a place's land owner, a person's
   * iNat login). null when there is nothing to add.
   */
  detail: string | null;
  /**
   * How many records stand behind this thing. Ties in match quality break by
   * weight, and the row shows it: a reader choosing between two same-named things
   * is choosing between two answer sizes.
   */
  weight: number;
  /**
   * The thing's page, or null when it has no page.
   *
   * ALWAYS SUPPLIED BY THE CALLER, NEVER DERIVED HERE. Page existence is not a
   * function of a name — src/taxon-pages.ts exists for exactly that reason, and
   * counties and ecoregions have no pages at all. A module that invented URLs
   * would send readers to 404s, which is worse than showing no link.
   */
  href: string | null;
}

export type SearchCandidate =
  | (CandidateBase & { kind: 'label'; suffix: string })
  | (CandidateBase & { kind: 'taxon'; taxonId: number })
  | (CandidateBase & { kind: 'person'; collector: CollectorEntry })
  | (CandidateBase & { kind: 'place'; slug: string })
  | (CandidateBase & { kind: 'county'; name: string })
  | (CandidateBase & { kind: 'ecoregion'; name: string });

// --- Sources -----------------------------------------------------------------
//
// What <bee-atlas> hands over. Each source carries its own href (or omits the
// field entirely where the kind can never have a page), so this module never has
// to know what the site build published.

export interface TaxonSource {
  taxonId: number;
  /** The plain scientific name — what a reader types. */
  name: string;
  /** The pane's display label, e.g. "Bombus (genus)" (buildTaxonLabel). */
  label: string;
  rank: string;
  /** Occurrences at this taxon OR BELOW IT — see rollUpTaxonCounts. */
  weight: number;
  href: string | null;
}

export interface PersonSource {
  collector: CollectorEntry;
  weight: number;
  href: string | null;
}

export interface PlaceSource {
  slug: string;
  name: string;
  landOwner: string | null;
  weight: number;
  href: string | null;
}

/** Counties and ecoregions have no pages, so RegionSource has no href field. */
export interface RegionSource {
  name: string;
  weight: number;
}

export interface SearchIndexSources {
  taxa: TaxonSource[];
  people: PersonSource[];
  places: PlaceSource[];
  counties: RegionSource[];
  ecoregions: RegionSource[];
}

// --- Index -------------------------------------------------------------------

interface IndexEntry {
  candidate: SearchCandidate;
  /**
   * Normalized strings this entry answers to. The best score across them wins, so
   * an alias (a collector's iNat login beside their name) can match without
   * competing with its own entry.
   */
  terms: string[];
  /** Word starts within each term, precomputed — see scoreTerm. */
  words: string[];
}

export interface SearchIndex {
  readonly entries: readonly IndexEntry[];
}

export const EMPTY_INDEX: SearchIndex = { entries: [] };

/**
 * Fold a string to its comparison form: diacritics stripped, lowercased,
 * whitespace collapsed. Applied to both sides, so `Sérgio` is reachable by typing
 * `sergio` and a pasted name with a double space still matches.
 */
export function normalizeTerm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Word starts within a normalized term — split on anything not alphanumeric. */
function wordStarts(term: string): string[] {
  return term.split(/[^a-z0-9]+/).filter(w => w.length > 0);
}

function entry(candidate: SearchCandidate, rawTerms: (string | null)[]): IndexEntry {
  const terms = [...new Set(rawTerms.filter((t): t is string => t !== null && t !== '').map(normalizeTerm))]
    .filter(t => t !== '');
  const words = [...new Set(terms.flatMap(wordStarts))];
  return { candidate, terms, words };
}

/**
 * Build the searchable index once per data load.
 *
 * The work here is normalization, not selection: every source row becomes an
 * entry. Filtering decisions belong to the caller — <bee-atlas> excludes places
 * with no records, because a place filter that can only ever produce an empty map
 * punishes being picked, and <bee-pane> already excludes them from its own options.
 */
export function buildSearchIndex(sources: SearchIndexSources): SearchIndex {
  const entries: IndexEntry[] = [];

  for (const t of sources.taxa) {
    entries.push(entry(
      {
        kind: 'taxon',
        taxonId: t.taxonId,
        key: `taxon:${t.taxonId}`,
        label: t.label,
        detail: t.rank,
        weight: t.weight,
        href: t.href,
      },
      // The NAME, not the label: "Bombus (genus)" would otherwise be reachable by
      // typing "genus", which matches every genus in the corpus.
      [t.name],
    ));
  }

  for (const p of sources.people) {
    const login = p.collector.host_inat_login;
    // A person with NEITHER identity field is unfilterable, so it must never reach
    // the list. buildFilterSQL builds the collector clause from recordedBy and
    // host_inat_login alone (filter.ts:457); with both null it collects no parts and
    // pushes NO CLAUSE, so picking such a row would appear to filter and in fact
    // show the whole corpus. CollectorEntry permits it ("either may be null"), and
    // it is also the only way two people could share a key — recordedBy arrives
    // from a GROUP BY, so it is distinct per row.
    if (p.collector.recordedBy === null && login === null) continue;
    entries.push(entry(
      {
        kind: 'person',
        collector: p.collector,
        key: `person:${p.collector.recordedBy ?? ''}|${login ?? ''}`,
        label: p.collector.displayName,
        detail: login === null ? null : `@${login}`,
        weight: p.weight,
        href: p.href,
      },
      // A person is findable by the name on the label OR by their iNat handle —
      // the two are different strings for the same human (CollectorEntry).
      [p.collector.displayName, p.collector.recordedBy, login],
    ));
  }

  for (const p of sources.places) {
    entries.push(entry(
      {
        kind: 'place',
        slug: p.slug,
        key: `place:${p.slug}`,
        label: p.name,
        detail: p.landOwner,
        weight: p.weight,
        href: p.href,
      },
      [p.name],
    ));
  }

  for (const c of sources.counties) {
    entries.push(entry(
      { kind: 'county', name: c.name, key: `county:${c.name}`, label: c.name, detail: null, weight: c.weight, href: null },
      [c.name],
    ));
  }

  for (const e of sources.ecoregions) {
    entries.push(entry(
      { kind: 'ecoregion', name: e.name, key: `ecoregion:${e.name}`, label: e.name, detail: null, weight: e.weight, href: null },
      [e.name],
    ));
  }

  return { entries };
}

// --- Ranking -----------------------------------------------------------------

const SCORE_EXACT = 3;
const SCORE_PREFIX = 2;
const SCORE_SUBSTRING = 1;
const SCORE_NONE = 0;

/**
 * How well one indexed entry answers a normalized query.
 *
 * A prefix of any WORD scores the same as a prefix of the whole term, because a
 * scientific name and a person's name are both read from either end: `vosnesenskii`
 * has to find *Bombus vosnesenskii*, and `smith` has to find *Smith, J.* A bare
 * substring still matches, but ranks below both — it is the difference between
 * naming a thing and happening to occur inside its name.
 */
function scoreEntry(e: IndexEntry, q: string): number {
  let best = SCORE_NONE;
  for (const term of e.terms) {
    if (term === q) return SCORE_EXACT; // nothing can beat it; stop looking
    if (term.startsWith(q)) { best = Math.max(best, SCORE_PREFIX); continue; }
    if (term.includes(q)) best = Math.max(best, SCORE_SUBSTRING);
  }
  if (best < SCORE_PREFIX && e.words.some(w => w.startsWith(q))) best = SCORE_PREFIX;
  return best;
}

/** How many rows the popover shows before it admits to holding back. */
export const DEFAULT_LIMIT = 10;

export interface RankedResult {
  candidates: SearchCandidate[];
  /**
   * True when matches were dropped to fit the limit. The popover must SAY so — a
   * silent top-N presented as the whole answer is the failure mode, because a
   * reader who does not see their thing concludes it is not in the data.
   */
  truncated: boolean;
}

const EMPTY_RESULT: RankedResult = { candidates: [], truncated: false };

/**
 * Rank an index against what the reader has typed so far.
 *
 * SYNTAX DECIDES THE KIND WHEN IT CAN. A query that parses as a catalog suffix is a
 * label number and nothing else can match it, so the result is exactly one
 * speculative row. That row is a promise to look, not a claim to have found: the
 * corpus-wide `substr` scan runs only when it is picked, which is what keeps
 * as-you-type free of SQL, and why miss/error are still reported through
 * `searchStatus` rather than through an absent candidate.
 *
 * Everything else ranks by match quality, then weight, then label. KIND IS NOT A
 * RANKING KEY — it is a group heading. Any fixed kind order gets "prolific collector
 * versus one-record subgenus" wrong in one direction or the other; the record count
 * behind a thing is the honest tie-break.
 */
export function rankCandidates(
  index: SearchIndex,
  rawQuery: string,
  limit: number = DEFAULT_LIMIT,
): RankedResult {
  const suffix = parseCatalogSuffix(rawQuery);
  if (suffix !== null) {
    return {
      candidates: [{
        kind: 'label',
        suffix,
        key: `label:${suffix}`,
        label: suffix,
        detail: null,
        weight: 0,
        href: null,
      }],
      truncated: false,
    };
  }

  const q = normalizeTerm(rawQuery);
  if (q === '') return EMPTY_RESULT;

  const scored: { entry: IndexEntry; score: number }[] = [];
  for (const e of index.entries) {
    const score = scoreEntry(e, q);
    if (score > SCORE_NONE) scored.push({ entry: e, score });
  }

  // Total order, so the same query always produces the same list: quality, then
  // weight, then label, then key. The last two exist purely for determinism —
  // without them a re-render could reshuffle two equally-good rows under the
  // reader's cursor.
  scored.sort((a, b) =>
    b.score - a.score
    || b.entry.candidate.weight - a.entry.candidate.weight
    || a.entry.candidate.label.localeCompare(b.entry.candidate.label)
    || a.entry.candidate.key.localeCompare(b.entry.candidate.key)
  );

  return {
    candidates: scored.slice(0, limit).map(s => s.entry.candidate),
    truncated: scored.length > limit,
  };
}

// --- Taxon weights -----------------------------------------------------------

/**
 * Roll direct occurrence counts up the taxonomy, so a genus earns the weight of
 * its species.
 *
 * WITHOUT THIS THE RANKING INVERTS. Records are identified to species, so *Bombus*
 * the genus has almost no occurrences of its own — it would sort below every
 * individual bumblebee species for the query `bombus`, which is precisely backwards
 * from what someone typing a genus name is asking for.
 *
 * Walks `lineage_path` the way buildTaxonOptions does (taxa.ts), but with one extra
 * rule that a Set made unnecessary there: an ancestor is counted ONCE per taxon.
 * Adding a count twice would be a silent inflation rather than a harmless duplicate,
 * so self and repeated segments are excluded explicitly.
 *
 * Ancestors absent from `taxonCache` are bycatch (is_anthophila=0) and are skipped —
 * they are not searchable, so nothing needs their weight.
 */
export function rollUpTaxonCounts(
  directCounts: ReadonlyMap<number, number>,
  taxonCache: ReadonlyMap<number, TaxonCacheEntry>,
): Map<number, number> {
  const rolled = new Map<number, number>();
  const add = (id: number, n: number) => rolled.set(id, (rolled.get(id) ?? 0) + n);

  for (const [taxonId, count] of directCounts) {
    if (count === 0) continue;
    add(taxonId, count);

    const entry = taxonCache.get(taxonId);
    if (!entry?.lineagePath) continue;

    const ancestors = new Set<number>();
    for (const segment of entry.lineagePath.split('/')) {
      if (segment === '') continue;
      const id = Number(segment);
      // `id === taxonId` guards the case where lineage_path includes the taxon
      // itself; the Set guards a repeated segment. Either would double-count.
      if (!Number.isFinite(id) || id === taxonId) continue;
      if (!taxonCache.has(id)) continue;
      ancestors.add(id);
    }
    for (const id of ancestors) add(id, count);
  }

  return rolled;
}

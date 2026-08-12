/**
 * Determination trust for photo candidates: ADR 0033, expert-trust-with-veto.
 *
 * A candidate observation qualifies for a query taxon T when at least one current
 * identification by an EXPERT is compatible with T, and no current expert identification is
 * incompatible with T. Ecdysis-backed candidates (specimen/waba_specimen arms) never reach
 * this gate — their determination is trusted by ingestion provenance, the other half of the
 * same rule — so this module only ever judges iNat-domain identifications, where logins are
 * unique and no cross-source person merge is needed.
 *
 * Compatibility is rank-scoped and synonym-aware:
 *   supports      the ID taxon is T or a descendant (via the ID's own ancestor_ids), or its
 *                 name folds to T's under occurrence synonymy (Bombus californicus vs
 *                 fervidus IS agreement). A finer-rank ID within T is agreement, never
 *                 conflict.
 *   coarser       the ID taxon is an ancestor of T (an expert saying "Apidae" does not
 *                 dispute Neolarra) — no support, no veto.
 *   incompatible  disjoint lineages after both checks. Only THESE veto, and only from
 *                 experts: a non-expert disagreeing is a curation anomaly, not a veto.
 *
 * This is the INTERIM implementation (beeatlas-r2u). The dbt trusted-taxon model
 * (beeatlas-xs1/nyr) supersedes it once published; keep the semantics aligned with the ADR,
 * not with this file.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { ROOT, USER_AGENT } from './config.mjs';

export const EXPERT_ROSTER_SH = path.join(ROOT, 'data', 'raw', 'inat_expert_obs.sh');
const SEEDS = path.join(ROOT, 'data', 'dbt', 'seeds');

/**
 * The EXPERTS array in inat_expert_obs.sh is the seed of the identifier registry and, until
 * that registry lands (beeatlas-16m), the operative expert list. Parsed from the shell
 * source rather than duplicated here — one list, one owner.
 */
export function parseExpertRoster(shText) {
  const m = shText.match(/^EXPERTS=\(([\s\S]*?)^\)/m);
  if (!m) throw new Error('EXPERTS=( ... ) block not found in roster script');
  const logins = new Set();
  for (const line of m[1].split('\n')) {
    const token = line.replace(/#.*$/, '').trim();
    if (token) logins.add(token);
  }
  return logins;
}

export function loadExpertLogins(shPath = EXPERT_ROSTER_SH) {
  return parseExpertRoster(readFileSync(shPath, 'utf8'));
}

/** Minimal CSV row parser: handles quoted fields (the source columns carry commas). */
export function parseCsv(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const fields = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQ = false;
        else cur += c;
      } else if (c === '"') inQ = true;
      else if (c === ',') { fields.push(cur); cur = ''; }
      else cur += c;
    }
    fields.push(cur);
    rows.push(fields);
  }
  return rows;
}

/**
 * Synonym map with int_synonyms' 3-layer precedence: manual (occurrence_synonyms) beats
 * auto_synonyms beats gbif_checklist_synonyms on the same synonym key. Same seeds, same
 * order, so the JS gate and the dbt models fold names identically.
 */
export function loadSynonyms(seedsDir = SEEDS) {
  const map = new Map();
  for (const file of ['occurrence_synonyms.csv', 'auto_synonyms.csv', 'gbif_checklist_synonyms.csv']) {
    const p = path.join(seedsDir, file);
    if (!existsSync(p)) continue;
    for (const [synonym, accepted] of parseCsv(readFileSync(p, 'utf8')).slice(1)) {
      const key = normalize(synonym);
      if (key && accepted && !map.has(key)) map.set(key, normalize(accepted));
    }
  }
  return map;
}

const normalize = (name) => String(name ?? '').trim().toLowerCase();

export function canonicalize(name, synonyms) {
  const n = normalize(name);
  return synonyms?.get(n) ?? n;
}

/**
 * One identification's stance toward the query taxon: 'supports' | 'coarser' | 'incompatible'.
 * `ident` is the flat shape pull-candidates.mjs persists: {taxon_id, name, ancestor_ids, ...}.
 * `queryAncestorIds` is the query taxon's own ancestry (loadTaxonAncestry), used only to
 * tell a harmless coarser ID from a disjoint one.
 */
export function identStance(ident, { queryTaxonId, queryName, synonyms, queryAncestorIds }) {
  const anc = ident.ancestor_ids ?? [];
  if (ident.taxon_id === queryTaxonId || anc.includes(queryTaxonId)) return 'supports';
  if (queryName != null && canonicalize(ident.name, synonyms) === canonicalize(queryName, synonyms)) return 'supports';
  if ((queryAncestorIds ?? []).includes(ident.taxon_id)) return 'coarser';
  return 'incompatible';
}

/**
 * The gate. `idents` is the persisted identification list for one observation (null/undefined
 * when the observation predates identification capture — the caller treats that as inert).
 * Returns {status, supporters, vetoers}; status:
 *   'trusted'   >=1 current expert ID supports, none incompatible
 *   'vetoed'    a current expert ID is incompatible with the query taxon
 *   'no-expert' no current expert ID supports (coarser-only, or experts absent)
 *   'no-data'   identifications were never captured for this observation
 */
export function observationTrust(idents, opts) {
  if (idents == null) return { status: 'no-data', supporters: [], vetoers: [] };
  const supporters = [], vetoers = [];
  for (const ident of idents) {
    if (ident.current === false) continue;          // superseded/withdrawn never count
    if (!opts.expertLogins.has(ident.login)) continue; // non-experts never gate (ADR 0033 §4)
    const stance = identStance(ident, opts);
    if (stance === 'supports') supporters.push(ident.login);
    else if (stance === 'incompatible') vetoers.push(ident.login);
  }
  const status = vetoers.length ? 'vetoed' : supporters.length ? 'trusted' : 'no-expert';
  return { status, supporters: [...new Set(supporters)], vetoers: [...new Set(vetoers)] };
}

/**
 * Ancestry for query taxa, from /v1/taxa in batches of 30, cached to a JSON file so re-runs
 * cost nothing. Returns Map(taxon_id -> ancestor_ids). PHOTO-07: this IS the iNat API.
 */
export async function loadTaxonAncestry(taxonIds, cachePath) {
  const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
  const todo = [...new Set(taxonIds)].filter((id) => id != null && !(id in cache));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < todo.length; i += 30) {
    const batch = todo.slice(i, i + 30);
    const res = await fetch(`https://api.inaturalist.org/v1/taxa/${batch.join(',')}`,
      { headers: { 'User-Agent': USER_AGENT } });
    await sleep(1100);
    if (!res.ok) { console.warn(`  ! taxa batch HTTP ${res.status} — ${batch.length} taxa left un-gated this run`); continue; }
    for (const t of (await res.json()).results ?? []) cache[t.id] = t.ancestor_ids ?? [];
    writeFileSync(cachePath, JSON.stringify(cache));
  }
  return new Map(Object.entries(cache).map(([k, v]) => [Number(k), v]));
}

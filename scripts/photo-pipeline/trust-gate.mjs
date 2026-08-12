/**
 * Determination trust for photo candidates: ADR 0033, expert-trust-with-veto.
 *
 * THE AUTHORITY IS THE PUBLISHED ARTIFACT (beeatlas-vsrh): `marts/occurrence_trust` →
 * occurrence_trust.parquet, keyed by occ_id, computed by the dbt trusted-taxon model — the
 * single implementation of the agreement semantics (int_trusted_taxon and its unit tests).
 * A candidate observation qualifies for query taxon T iff T ∈ trusted_ancestor_or_self on
 * its `inat_obs:<id>` row (ADR 0034 join contract). A missing row means "no trust
 * computed", never distrust.
 *
 * THE FALLBACK, for candidates newer than the artifact only (no row yet): observationTrust
 * below re-derives the ADR rule from the identifications pull-candidates persists with each
 * batch response. This is the demoted interim implementation (beeatlas-r2u) — Ecdysis-backed
 * candidates (specimen/waba_specimen arms) never reach it (trusted by ingestion provenance),
 * so it only ever judges iNat-domain identifications, where logins are unique and no
 * cross-source person merge is needed.
 *
 * Fallback compatibility is rank-scoped and synonym-aware:
 *   supports      the ID taxon is T or a descendant (via the ID's own ancestor_ids), or its
 *                 name folds to T's under occurrence synonymy (Bombus californicus vs
 *                 fervidus IS agreement). A finer-rank ID within T is agreement, never
 *                 conflict.
 *   coarser       the ID taxon is an ancestor of T (an expert saying "Apidae" does not
 *                 dispute Neolarra) — no support, no veto.
 *   incompatible  disjoint lineages after both checks. Only THESE veto, and only from
 *                 experts: a non-expert disagreeing is a curation anomaly, not a veto.
 *
 * Keep the fallback's semantics aligned with the ADR and the dbt model, not the reverse;
 * scripts/photo-pipeline/trust-artifact-diff.mjs measures the two against each other.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { ROOT, USER_AGENT } from './config.mjs';

const SEEDS = path.join(ROOT, 'data', 'dbt', 'seeds');
export const IDENTIFIER_REGISTER_CSV = path.join(SEEDS, 'identifier_register.csv');

/**
 * Expert logins from the identifier register — the single expert-status
 * authority (ADR 0033 item 5): rows with is_expert=true and an inat_login.
 * This retired the EXPERTS array in data/raw/inat_expert_obs.sh (the
 * register's seed); data/inat_expert_pipeline.py reads the same rows for its
 * ident_user_id filter, so the gate and the loader can never split.
 */
export function loadExpertLogins(registerPath = IDENTIFIER_REGISTER_CSV) {
  const rows = parseCsv(readFileSync(registerPath, 'utf8'));
  const header = rows[0];
  const login = header.indexOf('inat_login'), expert = header.indexOf('is_expert');
  return new Set(rows.slice(1).filter((r) => r[expert] === 'true' && r[login]).map((r) => r[login]));
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
 * Where the published artifact may live locally, in preference order: the pull-published /
 * export copy in public/data, then a local dbt build's sandbox output. Returns null when
 * neither exists — callers treat that as "artifact unavailable", not an error, so a
 * checkout without pipeline state degrades to the fallback (and, without identification
 * data either, to inert).
 */
export function resolveTrustArtifact() {
  const candidates = [
    path.join(ROOT, 'public', 'data', 'occurrence_trust.parquet'),
    path.join(ROOT, 'data', 'dbt', 'target', 'sandbox', 'occurrence_trust.parquet'),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

/**
 * Load the artifact's iNat-observation rows: Map(observation_id -> row). Only
 * `inat_obs:<id>` occ_ids can meet photo candidates here — specimen-photo observations
 * publish under `ecdysis:<n>` but arrive via the trusted arms, which bypass the gate.
 * In-memory duckdb, same pattern as seed-species-photos.mjs.
 */
export function loadTrustArtifact(parquetPath) {
  const sql = `SELECT occ_id, trusted_taxon_id, trusted_taxon_name, trusted_ancestor_or_self,
    is_disputed, identifier_count, identifiers
    FROM read_parquet('${parquetPath}') WHERE occ_id LIKE 'inat_obs:%'`.replace(/\n\s+/g, ' ');
  const rows = JSON.parse(execSync(`duckdb -json -c "${sql}"`, { encoding: 'utf8', maxBuffer: 1 << 28 }));
  return new Map(rows.map((r) => [Number(r.occ_id.slice('inat_obs:'.length)), r]));
}

/**
 * The artifact-side gate decision for one row (ADR 0034 consumption rule): the record
 * qualifies for the query taxon iff it is ancestor-or-self of the trusted taxon. A row
 * whose trusted taxon is NULL (expert self-disagreement, unresolved-name-only) never
 * qualifies — trusted_ancestor_or_self is NULL there too.
 *
 * The optional name fold is the JOIN-KEY safety net, not a second agreement rule: iNat
 * carries duplicate ACTIVE nodes for some names (Diadasia diminuta is both 307403 and
 * 1444494), and the query-taxon bridge can land on a different node than the experts
 * identified under — id membership alone then misses a record trusted at exactly the query
 * concept. When the folded trusted name equals the folded query name, that IS the query
 * concept (occurrence synonymy applied on both sides, same as identStance). The 2026-08-12
 * acceptance diff run: all 5 of 4,921 interim-vs-artifact divergences were this case.
 */
export function artifactTrust(row, queryTaxonId, { queryName, synonyms } = {}) {
  const qualifies = (row.trusted_ancestor_or_self ?? []).includes(queryTaxonId)
    || (queryName != null && row.trusted_taxon_name != null
        && canonicalize(row.trusted_taxon_name, synonyms) === canonicalize(queryName, synonyms));
  return {
    status: qualifies ? 'trusted' : 'untrusted',
    trustedTaxon: row.trusted_taxon_name ?? null,
    disputed: !!row.is_disputed,
    identifiers: row.identifiers ?? [],
  };
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

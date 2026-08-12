#!/usr/bin/env node
/**
 * ACCEPTANCE EVIDENCE for beeatlas-vsrh: does the published occurrence_trust artifact make
 * the same gate decisions as the interim in-pipeline implementation (beeatlas-r2u)?
 *
 *   node scripts/photo-pipeline/trust-artifact-diff.mjs [--trust <parquet>]
 *
 * Population: every scored candidate (species page x observation), minus trusted-arm
 * (specimen/waba_specimen) observations — those bypass BOTH implementations by provenance,
 * so no divergence is possible there. Arms come from occurrences.parquet the same way
 * pull-candidates derives its arms file, so this runs even before a re-pull.
 *
 * For each remaining (query taxon, observation) pair, two INDEPENDENT decisions:
 *   interim   observationTrust() — the r2u JS rule — over the observation's identifications
 *             read from the local duckdb iNat ingest (the same rows pull-candidates would
 *             persist), with the expert register, occurrence synonymy, and API ancestry.
 *   artifact  query taxon ∈ trusted_ancestor_or_self on the `inat_obs:<id>` row.
 *
 * The SHARED population is where both sides have evidence (an artifact row AND ingested
 * identifications). Divergences there are what the acceptance clause is about; expected
 * causes are cross-source effects the interim rule cannot see (Ecdysis determinations
 * counting in, dual-system person dedup, hedge-qualifier resolution) plus taxonomy-snapshot
 * drift between the live /v1/taxa ancestry and taxa.csv.gz. Writes the full report to
 * .cache/photo-pipeline/out/trust-artifact-diff.json.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';
import TOML from '@iarna/toml';
import { ROOT, OUT, MANIFEST } from './config.mjs';
import { loadExpertLogins, loadSynonyms, observationTrust, loadTaxonAncestry, resolveTrustArtifact, loadTrustArtifact, artifactTrust } from './trust-gate.mjs';
import { loadTaxonIds, normalizeName } from '../seed-species-photos.mjs';

const strFlag = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i === -1 ? d : process.argv[i + 1]; };
const dbPath = path.join(ROOT, 'data', 'beeatlas.duckdb');
const artifactPath = strFlag('trust', null) ?? resolveTrustArtifact();
if (!artifactPath) throw new Error('no occurrence_trust.parquet found (pull-published or a local dbt build provides one)');
if (!existsSync(dbPath)) throw new Error('data/beeatlas.duckdb missing (query-taxon ids + the iNat identification ingest)');

// ---- population: scored candidates on real species pages, keyed (species, observation) ----
const scored = readFileSync(path.join(OUT, 'candidate-parts.jsonl'), 'utf8')
  .split('\n').filter(Boolean).map(JSON.parse).filter((r) => !r.error && r.information != null);
const manifest = TOML.parse(readFileSync(MANIFEST, 'utf8'));
const pageSpecies = new Set(Object.keys(manifest.species).map((k) => k.toLowerCase()));
const pairs = new Map(); // 'species|obs' -> {species, obs}
for (const r of scored) {
  const s = r.species.toLowerCase();
  if (pageSpecies.has(s)) pairs.set(`${s}|${r.observation_id}`, { species: s, obs: Number(r.observation_id) });
}

// trusted arms, derived exactly as pull-candidates derives candidate-arms.json
const armsSql = `
  SELECT specimen_observation_id AS obs_id, list(DISTINCT record_type) AS arms
  FROM read_parquet('${path.join(ROOT, 'public', 'data', 'occurrences.parquet')}')
  WHERE specimen_observation_id IS NOT NULL GROUP BY 1`.replace(/\n\s+/g, ' ').trim();
const trustedArms = new Set(JSON.parse(execSync(`duckdb -json -c "${armsSql}"`, { encoding: 'utf8', maxBuffer: 1 << 28 }))
  .filter((r) => r.arms.includes('specimen') || r.arms.includes('waba_specimen'))
  .map((r) => Number(r.obs_id)));

// ---- the two evidence sources ----
const artifact = loadTrustArtifact(artifactPath);

// identifications from the duckdb ingest, reshaped to the pull-candidates persist shape;
// the two child tables can share an observation, so dedupe on identification id
const identSql = `
  SELECT id, observation_id, current, user__login AS login, taxon__id AS taxon_id,
         taxon__name AS name, taxon__ancestor_ids AS ancestor_ids
  FROM inat_expert_data.observations__identifications
  UNION ALL
  SELECT id, observation_id, current, user__login AS login, taxon__id AS taxon_id,
         taxon__name AS name, taxon__ancestor_ids AS ancestor_ids
  FROM inat_expert_data.specimen_linked_observations__identifications`.replace(/\n\s+/g, ' ').trim();
const identRows = JSON.parse(execSync(`duckdb "${dbPath}" -readonly -json "${identSql}"`, { encoding: 'utf8', maxBuffer: 1 << 28 }));
const identsByObs = new Map();
const seenIdent = new Set();
for (const r of identRows) {
  if (seenIdent.has(r.id)) continue;
  seenIdent.add(r.id);
  const list = identsByObs.get(r.observation_id) ?? [];
  list.push({
    login: r.login, taxon_id: r.taxon_id, name: r.name, current: r.current,
    ancestor_ids: r.ancestor_ids ? String(r.ancestor_ids).split(',').map(Number) : [],
  });
  identsByObs.set(r.observation_id, list);
}

const expertLogins = loadExpertLogins();
const synonyms = loadSynonyms();
const taxa = loadTaxonIds(dbPath);

const tids = new Set([...new Set([...pairs.values()].map((p) => p.species))]
  .map((s) => taxa.get(normalizeName(s))).filter((t) => t != null));
const ancestry = await loadTaxonAncestry([...tids], path.join(OUT, 'taxon-ancestry.json'));

// ---- compare ----
const counts = { pairs: 0, bypassed: 0, noTaxon: 0, neither: 0, artifactOnly: 0, interimOnly: 0, shared: 0, agree: 0, diverge: 0 };
const divergences = [];
const singleSided = { artifactOnly: [], interimOnly: [] };
for (const { species, obs } of pairs.values()) {
  counts.pairs++;
  if (trustedArms.has(obs)) { counts.bypassed++; continue; }
  const tid = taxa.get(normalizeName(species));
  if (!tid) { counts.noTaxon++; continue; }
  const row = artifact.get(obs);
  const idents = identsByObs.get(obs);
  if (!row && !idents) { counts.neither++; continue; }
  const interim = idents ? observationTrust(idents, {
    expertLogins, synonyms, queryTaxonId: tid, queryName: species,
    queryAncestorIds: ancestry.get(tid) ?? [],
  }) : null;
  if (row && !idents) { counts.artifactOnly++; singleSided.artifactOnly.push({ species, obs }); continue; }
  if (!row && idents) { counts.interimOnly++; singleSided.interimOnly.push({ species, obs, interim: interim.status }); continue; }
  counts.shared++;
  const a = artifactTrust(row, tid, { queryName: species, synonyms });
  if ((a.status === 'trusted') === (interim.status === 'trusted')) { counts.agree++; continue; }
  counts.diverge++;
  divergences.push({
    species, observation_id: obs, query_taxon_id: tid,
    artifact: { status: a.status, trusted_taxon: a.trustedTaxon, disputed: a.disputed },
    interim: { status: interim.status, supporters: interim.supporters, vetoers: interim.vetoers },
    idents: idents.filter((i) => i.current !== false).map((i) => `${i.login}:${i.name}${expertLogins.has(i.login) ? ' (expert)' : ''}`),
  });
}

writeFileSync(path.join(OUT, 'trust-artifact-diff.json'), JSON.stringify({
  artifact: path.relative(ROOT, artifactPath), counts, divergences, singleSided,
}, null, 2));

console.log(`artifact: ${path.relative(ROOT, artifactPath)}`);
console.log(`${counts.pairs} (species, observation) pairs among scored candidates`);
console.log(`  ${counts.bypassed} trusted-arm bypass (gate never applies), ${counts.noTaxon} unresolvable query taxon, ${counts.neither} no evidence on either side`);
console.log(`  ${counts.artifactOnly} artifact-only (no ingested idents), ${counts.interimOnly} interim-only (no artifact row — the fallback population)`);
console.log(`SHARED population: ${counts.shared}   agree: ${counts.agree}   DIVERGE: ${counts.diverge}`);
for (const d of divergences.slice(0, 20)) {
  console.log(`  ${d.species} obs ${d.observation_id}: artifact=${d.artifact.status}(${d.artifact.trusted_taxon}${d.artifact.disputed ? ', disputed' : ''}) interim=${d.interim.status} [${d.idents.join('; ')}]`);
}
if (divergences.length > 20) console.log(`  ... ${divergences.length - 20} more in trust-artifact-diff.json`);
console.log(`\nreport: .cache/photo-pipeline/out/trust-artifact-diff.json`);

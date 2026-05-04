# Phase 79: Photo Manifest — Research

**Researched:** 2026-05-04
**Domain:** TOML manifest authoring, iNaturalist API, Node.js build tooling, Vitest
**Confidence:** HIGH

## Summary

Phase 79 builds three artifacts: a hand-edited TOML manifest at `content/species-photos.toml`, a build-chain validator at `scripts/validate-species.mjs`, and a one-shot seed helper at `scripts/seed-species-photos.mjs`. The phase also extends the `npm run build` chain and adds Vitest tests in `src/tests/validate-species.test.ts`.

The manifest is the source of truth for per-species photos consumed by Phase 80 via `_data/photos.js`. The validator is the enforcement mechanism: it exits nonzero on any license violation or missing attribution, and is inserted after `validate-schema` and before `eleventy` in the build script. The seed is a developer utility — never in CI — that queries iNat at ≤1 req/sec to populate starter entries for all ~735 species.

All research questions were resolved via live tool calls: iNat API queried directly, `@iarna/toml` behavior verified by installing temporarily in `/tmp`, DuckDB bridge table inspected against the real database, and existing code patterns read from the project source tree.

**Primary recommendation:** Use `@iarna/toml` for parse/stringify (already locked by CONTEXT.md). Use the DuckDB CLI (`duckdb data/beeatlas.duckdb -json "SELECT ..."`) to read taxon_ids in the seed — no new npm package needed since the CLI is already installed. Use a simple `for...of` loop with `await new Promise(r => setTimeout(r, 1000))` for rate-limiting — no third-party package needed for sequential ≤1 req/sec.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01 Seed write policy: fill-only, never overwrite [LOCKED]**
`scripts/seed-species-photos.mjs` only adds entries for species whose `[species."<scientificName>"]` table does not yet exist in the TOML. Existing tables — including their `description` field, `[[photos]]` array, captions, ordering, and any human-added fields — are never modified. Re-runs are safe and idempotent at the table-key level: humans always win.

**D-02 Manifest scope: all species in species.json (~735) [LOCKED]**
Seed iterates every species present in `public/data/species.json` (the Phase 78 species feed), including checklist-only species with no iNat occurrences. Species with no usable iNat photos get a table with no `[[photos]]` array (or an empty one) and an empty `description`.

**D-03 Photo selection heuristic: top 3 research-grade by faves, WA preferred [LOCKED]**
Query iNat `/v1/observations?taxon_id=<id>&quality_grade=research&order_by=votes`. Prefer Washington (`place_id=46`); fall back to global if fewer than 3 WA candidates pass the license filter. Skip photos whose `license_code` is null, `all-rights-reserved`, or outside the PHOTO-02 whitelist. taxon_id resolved from `data/beeatlas.duckdb::inaturalist_data.canonical_to_taxon_id`.

**D-04 Test runtime: Vitest in src/tests/ [LOCKED]**
Tests at `src/tests/validate-species.test.ts`. Validator must export core function (not just CLI side effects). Fixture TOMLs with bad licenses, missing attribution, unknown scientificNames.

### Claude's Discretion

- Exact validator API surface (single function vs. multiple smaller exports)
- Error message format and line numbers
- Seed CLI flags (`--dry-run`, `--limit N`)
- Exact fallback sequence when WA returns <3: top-up from global
- Rate-limiter implementation
- Fixture TOML location (under `src/tests/fixtures/` or inline strings)
- Whether seed writes empty `photos = []` or omits array for species with no photos
- Whether `description` is omitted or written as `description = ""`

### Deferred Ideas (OUT OF SCOPE)

- Comment preservation across seed re-runs
- Per-species photo count tuning (beyond top-3)
- Seed CLI flag `--refresh <scientificName>`
- Auto-rotation of photos based on community votes
- Non-iNat photo sources
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PHOTO-01 | `content/species-photos.toml` schema: `[species."<scientificName>"]` with optional `description` and `[[photos]]` arrays | `@iarna/toml` stringify produces exactly this format (verified); quoted keys with spaces/parens round-trip cleanly |
| PHOTO-02 | `license` required; allowed: `{cc0, cc-by, cc-by-nc, cc-by-sa, cc-by-nc-sa}`; null/missing/`all-rights-reserved` rejected | iNat `photo.license_code` verified to return these exact strings; `all-rights-reserved` is the real iNat value (not a fuzzy variant) |
| PHOTO-03 | `attribution` required for non-CC0 photos; rendered verbatim | iNat `photo.attribution` field returns verbatim strings like `(c) User, some rights reserved (CC BY-NC)` |
| PHOTO-04 | URL stored at fill time from iNat API; never constructed at render time | iNat `photo.url` returns `square` size; seed transforms to `large` by string replacement before storing (seed-time transform ≠ render-time construction) |
| PHOTO-05 | `validate-species.mjs`: parses TOML, cross-refs `species.json`, exits nonzero on errors; warns on unknown names | Pattern fully mirrored from `validate-schema.mjs`; exported function for in-process Vitest testing |
| PHOTO-06 | `npm run build` runs `validate-species` after `validate-schema` and before `eleventy` | Current build chain: `validate-schema && typecheck && eleventy`; new chain: `validate-schema && validate-species && typecheck && eleventy` |
| PHOTO-07 | `seed-species-photos.mjs`: iNat queries at ≤1 req/sec; NOT in build chain | Pattern from `data/inaturalist_pipeline.py`; DuckDB CLI for taxon_id lookup; simple `setTimeout` loop for rate limiting |
| PHOTO-08 | Vitest fixtures: bad licenses, missing attribution; validator rejects them | Existing Vitest tests in `src/tests/` use inline test data and `readFileSync`; fixture TOML strings viable as inline constants |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| TOML manifest storage | Static file (git) | — | Hand-edited source of truth; no server needed |
| License/attribution validation | Build (Node.js script) | — | Catches violations before deploy; not at runtime |
| Photo URL resolution | Seed script (one-shot) | — | Out-of-band; iNat calls never happen in CI |
| taxon_id lookup | DuckDB (seed-time) | — | Bridge table has 100% coverage; no iNat roundtrip needed |
| Manifest consumption | Eleventy data file (`_data/photos.js`) | — | Phase 80 concern; research confirms TOML shape is compatible |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@iarna/toml` | 2.2.5 | TOML parse and stringify | Locked by CONTEXT.md; Phase 80 uses same lib in `_data/photos.js`; correct round-trip for quoted-key table-arrays verified [VERIFIED: npm registry + live test] |
| `node:fs` | built-in | Read/write TOML and JSON | No dep needed |
| `node:child_process` | built-in | DuckDB CLI invocation in seed | Already available; duckdb CLI at `/opt/homebrew/bin/duckdb` v1.5.2 [VERIFIED: local] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vitest` | ^4.1.2 | Test runner | Already in devDependencies; validator test lives here |
| `duckdb` CLI | v1.5.2 | taxon_id lookup in seed | Shell out with `-json` flag; avoids `@duckdb/node-api` install |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| DuckDB CLI shell-out | `@duckdb/node-api` 1.5.2 | Node API is cleaner but adds a new dependency; CLI already installed and outputs clean JSON |
| Custom `setTimeout` loop | `p-limit` 7.3.0 | p-limit adds concurrency control; unnecessary for strictly sequential ≤1 req/sec |
| Custom `setTimeout` loop | `bottleneck` | Distributed scheduler overkill for a one-shot script |
| `@iarna/toml` | `smol-toml` 1.6.1 | smol-toml is fast and modern but CONTEXT.md locked `@iarna/toml` |

**Installation:**
```bash
npm install @iarna/toml
```
Note: add to `dependencies` (not `devDependencies`) — validator runs in the build chain [CITED: 079-CONTEXT.md canonical_refs].

**Version verification:** `@iarna/toml@2.2.5` confirmed via `npm view @iarna/toml version`. Published 2020-04-22 — stable, no breaking changes expected. [VERIFIED: npm registry]

---

## Architecture Patterns

### System Architecture Diagram

```
Developer machine (one-shot):
  data/beeatlas.duckdb
    └─ canonical_to_taxon_id  ─────────────────┐
                                                ↓
  public/data/species.json  ──────── seed-species-photos.mjs
  (Phase 78 output)                   │  rate-limited ≤1 req/sec
                                      ↓
                            api.inaturalist.org/v1/observations
                                      │
                                      ↓ (filtered: research-grade, WA preferred,
                                         license whitelist, top-3 by faves)
                            content/species-photos.toml  ◄── human edits
                                      │
CI / `npm run build`:                  │
  validate-schema.mjs                 │
        │ OK                          │
        ↓                             │
  validate-species.mjs ◄──────────────┘
        │ reads also: public/data/species.json
        │ exits 1 on license/attribution violations
        │ exits 0 with warning on unknown scientificNames
        ↓ OK
  tsc --noEmit
        ↓ OK
  eleventy + vite
        │
        ↓
  _data/photos.js  ◄── reads species-photos.toml via @iarna/toml
  (Phase 80 consumer)
```

### Recommended Project Structure

```
content/
└── species-photos.toml     # hand-edited manifest, seeded once

scripts/
├── validate-schema.mjs     # existing (analog)
├── validate-species.mjs    # new — build-chain gate
└── seed-species-photos.mjs # new — one-shot helper, NOT in build

src/tests/
└── validate-species.test.ts  # new — Vitest coverage
```

### Pattern 1: validate-species.mjs — CLI + exported function

Mirror `validate-schema.mjs` exactly:

```javascript
// scripts/validate-species.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import TOML from '@iarna/toml';

const LICENSE_WHITELIST = new Set(['cc0', 'cc-by', 'cc-by-nc', 'cc-by-sa', 'cc-by-nc-sa']);

/**
 * Validate species-photos.toml against species.json.
 * Returns { errors: string[], warnings: string[] }.
 * errors → caller should exit 1.
 * warnings → caller should print but exit 0.
 */
export function validateSpeciesPhotos(tomlSource, speciesJsonArray) {
  const errors = [];
  const warnings = [];
  const manifest = TOML.parse(tomlSource);
  const knownNames = new Set(speciesJsonArray.map(s => s.scientificName));

  for (const [name, entry] of Object.entries(manifest.species ?? {})) {
    if (!knownNames.has(name)) {
      warnings.push(`unknown species: "${name}" not in species.json`);
    }
    for (const photo of (entry.photos ?? [])) {
      if (!photo.license || !LICENSE_WHITELIST.has(photo.license)) {
        errors.push(`${name}: photo ${photo.photo_id} has invalid license "${photo.license}"`);
      }
      if (photo.license !== 'cc0' && !photo.attribution) {
        errors.push(`${name}: photo ${photo.photo_id} missing attribution (required for ${photo.license})`);
      }
    }
  }
  return { errors, warnings };
}

// CLI entrypoint — only runs when invoked directly
const MANIFEST = join(new URL('..', import.meta.url).pathname, 'content/species-photos.toml');
const SPECIES_JSON = join(new URL('..', import.meta.url).pathname, 'public/data/species.json');

const tomlSource = readFileSync(MANIFEST, 'utf-8');
const speciesJson = JSON.parse(readFileSync(SPECIES_JSON, 'utf-8'));
const { errors, warnings } = validateSpeciesPhotos(tomlSource, speciesJson);

for (const w of warnings) console.warn(`warn: ${w}`);
for (const e of errors) console.error(`error: ${e}`);

if (errors.length > 0) {
  console.error(`\nValidation failed: ${errors.length} error(s).`);
  process.exit(1);
}
```

[Source: mirrored from `scripts/validate-schema.mjs` pattern — VERIFIED local]

### Pattern 2: seed-species-photos.mjs — rate-limited iNat fetch

```javascript
// scripts/seed-species-photos.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import TOML from '@iarna/toml';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DB = join(ROOT, 'data', 'beeatlas.duckdb');
const SPECIES_JSON = join(ROOT, 'public', 'data', 'species.json');
const MANIFEST = join(ROOT, 'content', 'species-photos.toml');
const INAT_BASE = 'https://api.inaturalist.org/v1/observations';
const USER_AGENT = 'BeeAtlas/seed-species-photos (rainhead@gmail.com; github.com/rainhead/beeatlas)';
const LICENSE_WHITELIST = new Set(['cc0', 'cc-by', 'cc-by-nc', 'cc-by-sa', 'cc-by-nc-sa']);
const WA_PLACE_ID = 46;

// Load taxon_ids from DuckDB bridge table
function loadTaxonIds() {
  const json = execSync(
    `duckdb "${DB}" -json "SELECT s.scientificName, b.taxon_id FROM checklist_data.species s LEFT JOIN inaturalist_data.canonical_to_taxon_id b ON LOWER(s.scientificName) = b.canonical_name UNION SELECT o.scientificName, b.taxon_id FROM ecdysis_data.occurrences o LEFT JOIN inaturalist_data.canonical_to_taxon_id b ON o.canonical_name = b.canonical_name WHERE o.canonical_name IS NOT NULL"`,
    { encoding: 'utf-8' }
  );
  const rows = JSON.parse(json);
  return new Map(rows.map(r => [r.scientificName, r.taxon_id]));
}

async function fetchPhotos(taxonId, placeId = null) {
  const params = new URLSearchParams({
    taxon_id: taxonId, quality_grade: 'research', order_by: 'votes', per_page: 10,
    ...(placeId ? { place_id: placeId } : {}),
  });
  const resp = await fetch(`${INAT_BASE}?${params}`, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  return data.results ?? [];
}

function photoUrlToLarge(url) {
  // iNat returns square.jpg or square.jpeg; transform to large variant
  return url.replace(/\/square(\.\w+)$/, '/large$1');
}

function extractPhotos(observations) {
  const photos = [];
  let ordering = 1;
  for (const obs of observations) {
    for (const photo of (obs.photos ?? [])) {
      if (!photo.license_code || !LICENSE_WHITELIST.has(photo.license_code)) continue;
      photos.push({
        observation_id: obs.id,
        photo_id: photo.id,
        url: photoUrlToLarge(photo.url),
        caption: '',
        attribution: photo.attribution,
        license: photo.license_code,
        ordering: ordering++,
      });
      if (photos.length >= 3) return photos;
    }
    if (photos.length >= 3) return photos;
  }
  return photos;
}

// Main: fill-only for species not yet in manifest
async function main() {
  const speciesJson = JSON.parse(readFileSync(SPECIES_JSON, 'utf-8'));
  const taxonIds = loadTaxonIds();
  const manifest = existsSync(MANIFEST)
    ? TOML.parse(readFileSync(MANIFEST, 'utf-8'))
    : { species: {} };
  manifest.species ??= {};

  for (const { scientificName } of speciesJson) {
    if (manifest.species[scientificName]) continue;  // D-01: fill-only

    const taxonId = taxonIds.get(scientificName);
    let photos = [];
    if (taxonId) {
      const waObs = await fetchPhotos(taxonId, WA_PLACE_ID);
      await new Promise(r => setTimeout(r, 1000));  // ≤1 req/sec
      photos = extractPhotos(waObs);

      if (photos.length < 3) {
        const globalObs = await fetchPhotos(taxonId, null);
        await new Promise(r => setTimeout(r, 1000));
        const globalPhotos = extractPhotos(globalObs);
        // top-up: add global photos not already in WA set
        const existingPhotoIds = new Set(photos.map(p => p.photo_id));
        for (const p of globalPhotos) {
          if (!existingPhotoIds.has(p.photo_id) && photos.length < 3) {
            p.ordering = photos.length + 1;
            photos.push(p);
          }
        }
      }
    }
    manifest.species[scientificName] = {
      description: '',
      ...(photos.length > 0 ? { photos } : {}),
    };
  }

  writeFileSync(MANIFEST, TOML.stringify(manifest), 'utf-8');
  console.log('Done. Manifest written to', MANIFEST);
}

main().catch(e => { console.error(e); process.exit(1); });
```

[Source: patterns from `data/inaturalist_pipeline.py`, `data/resolve_taxon_ids.py` — VERIFIED local]

### Pattern 3: Build chain wiring

Current `package.json`:
```json
"build": "npm run validate-schema && npm run typecheck && eleventy"
```

After this phase:
```json
"validate-species": "node scripts/validate-species.mjs",
"build": "npm run validate-schema && npm run validate-species && npm run typecheck && eleventy"
```

[VERIFIED: `package.json` read locally]

### Pattern 4: Vitest test structure

```typescript
// src/tests/validate-species.test.ts
import { test, expect, describe } from 'vitest';
import { validateSpeciesPhotos } from '../../scripts/validate-species.mjs';

const GOOD_SPECIES_JSON = [{ scientificName: 'Osmia lignaria', slug: 'osmia-lignaria', occurrence_count: 5, on_checklist: true, canonical_name: 'osmia lignaria' }];
const UNKNOWN_SPECIES_JSON = [{ scientificName: 'Bombus vosnesenskii', slug: 'bombus-vosnesenskii', occurrence_count: 10, on_checklist: true, canonical_name: 'bombus vosnesenskii' }];

const BAD_LICENSE_TOML = `
[species."Osmia lignaria"]
description = ""
[[species."Osmia lignaria".photos]]
observation_id = 123
photo_id = 456
url = "https://example.com/large.jpg"
caption = ""
attribution = "(c) Test User"
license = "all-rights-reserved"
ordering = 1
`;

describe('validateSpeciesPhotos', () => {
  test('rejects all-rights-reserved license', () => {
    const { errors } = validateSpeciesPhotos(BAD_LICENSE_TOML, GOOD_SPECIES_JSON);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('invalid license');
  });

  test('rejects missing attribution for non-cc0', () => { /* ... */ });
  test('warns on unknown species, does not error', () => { /* ... */ });
  test('accepts valid cc0 with no attribution', () => { /* ... */ });
  test('accepts valid cc-by with attribution', () => { /* ... */ });
});
```

[Source: pattern from `src/tests/url-state.test.ts` and `src/tests/bee-header.test.ts` — VERIFIED local]

### Anti-Patterns to Avoid

- **Importing validator via CLI side effects**: The validator must export `validateSpeciesPhotos` as a named export so Vitest can call it in-process. The CLI part runs only when `import.meta.url` matches the process entrypoint.
- **Filtering by `obs.license_code` instead of `photo.license_code`**: Each photo in an observation has its own `license_code` — `obs.license_code` reflects the observation-level license, which may differ from individual photo licenses. [VERIFIED: live iNat API call]
- **Constructing photo URLs from observation/photo IDs at render time**: PHOTO-04 is explicit — seeds store the full URL verbatim. The seed-time `square → large` transform is acceptable; it happens once at seed time, not in the browser.
- **Adding validate-species to npm scripts as `prebuild`**: Build chain uses `&&` chaining, not `pre*` hooks — follow the existing pattern.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| TOML parse + stringify | Custom parser | `@iarna/toml` | Handles quoted keys with spaces/parens, table-arrays, integer formatting — all verified |
| Rate limiting | Complex queue | `await setTimeout(1000)` loop | Sequential; no concurrency needed; ~12 min for 735 species at 2 req each |
| taxon_id lookup | iNat taxa-search at seed time | DuckDB CLI JSON output | Bridge table has 100% coverage (735/735 species); avoids extra iNat API calls |
| All-rights-reserved check | Fuzzy string match | `!LICENSE_WHITELIST.has(code)` | Whitelist-as-set handles null, undefined, "all-rights-reserved" and future variants in one check |

**Key insight:** The DuckDB bridge table (`inaturalist_data.canonical_to_taxon_id`) was fully populated by Phase 77 (all 735 species, 0 nulls — verified against live DB). The seed does not need to call iNat's taxa-search endpoint at all.

---

## iNat API Contract

### Request Shape

**WA-first pass:**
```
GET https://api.inaturalist.org/v1/observations
  ?taxon_id=<integer>
  &quality_grade=research
  &order_by=votes
  &place_id=46
  &per_page=10
```

**Global fallback (when WA yields <3 licensed photos):**
```
GET https://api.inaturalist.org/v1/observations
  ?taxon_id=<integer>
  &quality_grade=research
  &order_by=votes
  &per_page=10
```

**Key parameters** [VERIFIED: live API call]:
- `order_by=votes` sorts by `cached_votes_total` (fave count). Confirmed: obs 0 → faves_count=6, obs 1 → faves_count=5, obs 2 → faves_count=4 in descending order.
- `per_page` maximum: 200. Use 10 for seed (need at most 3 licensed photos; fetching 10 gives buffer for license-filtered-out photos). [VERIFIED: per_page=200 returns 200 results]
- `place_id=46` = Washington state. [VERIFIED: iNat places API confirms "Washington | type 8 | admin_level 10"]
- No auth headers required for read-only queries. Rate limit is ≤60 req/min (documented as "normal_throttling" 429 response); 1 req/sec = 60/min gives headroom. [CITED: `data/inaturalist_pipeline.py` comment + live test]

**User-Agent:** `BeeAtlas/seed-species-photos (rainhead@gmail.com; github.com/rainhead/beeatlas)` — no specific format documented but project convention to include contact info. [ASSUMED — no official requirement found; courtesy practice from Python pipeline]

### Response Shape

Each observation in `results[]`:
- `id` — integer observation_id
- `faves_count` — integer fave count (same as `cached_votes_total`)
- `photos[]` — array of photo objects (may be empty; one observation can have 10+ photos)

Each photo object [VERIFIED: live API call]:
```json
{
  "id": 52274835,
  "license_code": "cc0",
  "original_dimensions": { "width": 2041, "height": 2041 },
  "url": "https://inaturalist-open-data.s3.amazonaws.com/photos/52274835/square.jpg",
  "attribution": "no rights reserved",
  "flags": [],
  "moderator_actions": [],
  "hidden": false
}
```

- `url` always returns `square` size (75×75 px thumbnail).
- `license_code` is the per-photo license — may differ from `obs.license_code`. Must filter by `photo.license_code`.
- `attribution` for CC0 photos: `"no rights reserved"`. For others: `"(c) Username, some rights reserved (CC BY-NC)"`.
- `all-rights-reserved` photos: `license_code` field is `null` (not the string "all-rights-reserved"). The string `"all-rights-reserved"` does not appear in photo objects. [VERIFIED: live API call, tested `photo_license=all-rights-reserved` filter returned 0 results for this taxon]

### Photo URL Size Resolution

URL pattern: `https://{cdn}/photos/{photo_id}/square.{ext}`

Size variants (string replacement in path): `square`, `thumb`, `small`, `medium`, `large`, `original`.

Seed stores `large` size:
```javascript
url.replace(/\/square(\.\w+)$/, '/large$1')
```
[VERIFIED: live HEAD request confirmed `/large.jpg` returns HTTP 200 for both `inaturalist-open-data.s3.amazonaws.com` and `static.inaturalist.org` CDN patterns]

**Important:** The URL in `photo.url` from the API is the `square` variant. The seed MUST transform it to `large` before storing. This is a seed-time transform (acceptable per PHOTO-04's "stored at fill time" language), not a render-time construction.

### Error Cases

- Non-existent taxon_id: API returns `{"error": ..., "status": ...}` with no `results` key. Code must check `data.results?.length ?? 0`. [VERIFIED: live API call with taxon_id=999999999]
- Species with zero research-grade WA observations: `total_results` may still be non-zero globally; seed handles by falling back.
- Checklist-only species with no iNat records anywhere: `total_results = 0`, `results = []`. Seed writes `{ description: '', photos: [] }` or omits photos key (Claude's discretion). [ASSUMED: not tested — no known checklist-only species verified to have 0 global results]

---

## Library Choices

### `@iarna/toml` (locked)

Version 2.2.5 [VERIFIED: npm registry]. Last published 2020-04-22 — stable, no breaking changes expected.

**Verified behavior** [VERIFIED: live test in `/tmp`]:
1. `TOML.stringify({ species: { 'Osmia lignaria': { photos: [{...}] } } })` produces `[species."Osmia lignaria"]` with `[[species."Osmia lignaria".photos]]` — exactly PHOTO-01 schema.
2. Quoted keys handle spaces, parentheses, periods (e.g., `"Lasioglossum (Dialictus) boreale"`, `"Osmia aff. lignaria"`) correctly.
3. Integers are formatted with underscores for readability: `observation_id = 33_289_514`. This is valid TOML; `TOML.parse` returns the correct integer.
4. Comments are not preserved (not a concern per D-01 fill-only policy).
5. Empty photos array: `photos = [ ]` in output. Existing tables survive a merge-and-stringify cycle intact.

**Import style** (ESM project, `"type": "module"` in package.json):
```javascript
import TOML from '@iarna/toml';
```
The package ships a CommonJS build; Node's ESM interop handles the default import correctly.

### DuckDB CLI for taxon_id lookup

```bash
duckdb data/beeatlas.duckdb -json "SELECT s.scientificName, b.taxon_id FROM ..."
```

[VERIFIED: installed at `/opt/homebrew/bin/duckdb` v1.5.2; `-json` flag outputs clean JSON array]

Coverage: 735/735 species in the FULL OUTER union have non-null `taxon_id` in the bridge table. [VERIFIED: DuckDB query against live database]

Alternative: `@duckdb/node-api@1.5.2-r.1` exists but adds a new dependency. The CLI is sufficient.

### Rate Limiting

Simple sequential loop with `await setTimeout`:
```javascript
await new Promise(r => setTimeout(r, 1000));
```
For 735 species with 2 iNat requests each (WA + global fallback worst-case): 1470 seconds ≈ 24.5 minutes. With WA pass covering ~50% of species: estimated 12-15 minutes. Acceptable for a one-shot helper.

No third-party library needed. [VERIFIED: `p-limit` installed but not in project; project does not use it]

---

## File-by-File Plan

| File | Action | Role | Notes |
|------|--------|------|-------|
| `content/species-photos.toml` | Create (seed), then hand-edit | Manifest source of truth | `content/` directory must also be created |
| `scripts/validate-species.mjs` | Create | Build-chain validator | Export `validateSpeciesPhotos(toml, speciesJson)`; also runnable as CLI |
| `scripts/seed-species-photos.mjs` | Create | One-shot seed helper | NOT in package.json build scripts |
| `package.json` | Modify | Build chain | Add `"validate-species"` script; insert in `"build"` after `validate-schema` |
| `src/tests/validate-species.test.ts` | Create | Vitest test file | Tests validator function with fixture TOML strings |

**New dependency to add:**
```bash
npm install @iarna/toml
```
(Move from potential devDependency to `dependencies` — validator runs in build chain)

---

## Existing-Pattern Analogs

### `scripts/validate-schema.mjs` — full source at `/Users/rainhead/dev/beeatlas/scripts/validate-schema.mjs`

Key patterns to mirror:
- `import { readFileSync } from 'node:fs'` — no top-level await needed for synchronous reads
- `let failed = false` + accumulate errors + `if (failed) process.exit(1)` at end
- `console.error('x filename: message')` for errors; `console.log('ok filename')` for successes
- Conditional logic (`if (useLocal && existsSync(path))`) for graceful degradation
- No exported function — the planner must add the export pattern for Vitest compatibility

### `src/tests/url-state.test.ts` — Vitest test style

- `import { test, expect, describe } from 'vitest'`
- Inline test data (not `readFileSync` fixture files)
- Named `describe` blocks grouping related assertions
- No mocking needed for pure validator function

### `src/tests/bee-atlas.test.ts` — `readFileSync` pattern for source analysis

- `import { readFileSync } from 'node:fs'`
- `const __dirname = dirname(fileURLToPath(import.meta.url))`
- `readFileSync(resolve(__dirname, '../somefile.ts'), 'utf-8')`
- Used when tests need to read project source files (arch.test.ts pattern)

### `data/inaturalist_pipeline.py::_inat_get_with_retry` — rate limiting pattern

- Confirmed 1-second pace between requests (`_INAT_PACE_SECONDS = 1.0`)
- Retry on 429/5xx with exponential backoff + Retry-After header
- Seed should mirror: add retry-on-5xx if desired (Claude's discretion — D-01 fill-only makes re-run safe)

### `data/resolve_taxon_ids.py` — DuckDB bridge table query pattern

- `execSync` equivalent: `duckdb path -json "SELECT ..."` produces clean JSON array
- Fill-only logic mirrors D-01 exactly: check `if b.canonical_name IS NULL` before inserting

---

## Common Pitfalls

### Pitfall 1: Filtering by `obs.license_code` instead of `photo.license_code`
**What goes wrong:** Observation `license_code` and photo `license_code` are independent. An observation can be CC-BY while individual photos are CC-BY-NC-ND (not in whitelist). Filtering on the wrong field lets non-whitelisted photos slip through.
**Why it happens:** The obvious variable is the top-level observation license.
**How to avoid:** Always iterate `obs.photos[]` and check `photo.license_code`. [VERIFIED: live API response shows both fields exist independently]
**Warning signs:** Photos in the TOML have `all-rights-reserved` or non-whitelisted licenses in the output.

### Pitfall 2: `photo.url` is the `square` variant — must transform to `large` before storing
**What goes wrong:** `photo.url` from the iNat API always returns the `square` variant (75×75 thumbnail). Storing it verbatim violates the spirit of PHOTO-04 (seed stores display-ready URL) and PERF-03 (hero images use medium/500px).
**Why it happens:** The API doesn't expose a URL template; only the square URL is in the response.
**How to avoid:** Apply `url.replace(/\/square(\.\w+)$/, '/large$1')` before storing. This is a seed-time transform, not render-time construction. [VERIFIED: `/large.jpg` HEAD returns HTTP 200]
**Warning signs:** Manifest URLs contain `/square.jpg` or `/square.jpeg`.

### Pitfall 3: Empty-result taxon crashes the seed
**What goes wrong:** Non-existent or unrecognized taxon_id returns `{"error": ..., "status": 404}` with no `results` key. Accessing `data.results.length` throws TypeError.
**Why it happens:** The API does not return a 200 with empty results array — it returns an error body.
**How to avoid:** Check `data.results?.length ?? 0` or wrap fetch in try/catch per-species. Log and continue (fill-only: species gets an empty photos entry). [VERIFIED: live API call with taxon_id=999999999]
**Warning signs:** Seed crashes mid-run with "Cannot read properties of undefined (reading 'length')".

### Pitfall 4: `@iarna/toml` integer underscores confuse humans but not the parser
**What goes wrong:** `TOML.stringify` writes integers with separator underscores (`observation_id = 33_289_514`). Human editors may assume this is a formatting error.
**Why it happens:** TOML spec allows `_` as digit separator for readability; `@iarna/toml` uses it by default.
**How to avoid:** Document in a comment at the top of `species-photos.toml` that underscores in integers are cosmetic and valid. No code change needed — `TOML.parse` handles them correctly.
**Warning signs:** None (code works correctly; only human surprise).

### Pitfall 5: `species.json` not present when seed runs
**What goes wrong:** Seed reads `public/data/species.json` as the species list. That file is produced by Phase 78 and may not exist on a fresh checkout or before Phase 78 has been run.
**Why it happens:** Phase dependency: seed requires Phase 78's output.
**How to avoid:** Seed should fail fast with a clear error: `if (!existsSync(SPECIES_JSON)) { console.error('Run the data pipeline first: cd data && uv run python run.py'); process.exit(1); }`.
**Warning signs:** `ENOENT` on `readFileSync(SPECIES_JSON)`.

### Pitfall 6: `content/` directory doesn't exist
**What goes wrong:** `writeFileSync('content/species-photos.toml', ...)` fails if `content/` doesn't exist.
**Why it happens:** `content/` is a new directory introduced in this phase. It doesn't exist in the current repo.
**How to avoid:** `mkdirSync('content', { recursive: true })` before writing. [VERIFIED: `ls content/` returns no output — directory absent]
**Warning signs:** `ENOENT: no such file or directory, open 'content/species-photos.toml'`.

### Pitfall 7: validate-species.mjs fails when species.json is absent (CloudFront fallback)
**What goes wrong:** In CI, `validate-schema.mjs` already has logic to skip the `species.json` check when running against CloudFront (no local parquet). The new `validate-species.mjs` also reads `species.json`. If `species.json` doesn't exist locally (CI hasn't run the pipeline), the validator crashes.
**Why it happens:** Build chain runs validators before building, but data pipeline is separate.
**How to avoid:** Mirror `validate-schema.mjs` graceful-degradation pattern: if `species.json` doesn't exist, skip the cross-reference check (unknown-species warnings only) and continue. The TOML format validation (license, attribution) can still run.
**Warning signs:** CI build fails on `validate-species` but not `validate-schema`.

### Pitfall 8: `@iarna/toml` doesn't handle ESM default import without interop
**What goes wrong:** `import TOML from '@iarna/toml'` may fail in strict ESM because the package ships CJS with `module.exports`, not an ES module `default` export.
**Why it happens:** Package is pre-ESM (published 2020); Node ESM interop wraps CJS `module.exports` as the default export.
**How to avoid:** Use `import TOML from '@iarna/toml'` — Node's ESM-CJS interop handles this correctly. If it doesn't (rare), use `import { createRequire } from 'node:module'; const require = createRequire(import.meta.url); const TOML = require('@iarna/toml');` [ASSUMED: ESM interop works; not tested in-project since package not yet installed]
**Warning signs:** `SyntaxError: The requested module '@iarna/toml' does not provide an export named 'default'`.

### Pitfall 9: TOML key ordering in stringify is non-deterministic
**What goes wrong:** `TOML.stringify` iterates object keys in JavaScript insertion order. If species are added from `species.json` in a different order on successive runs, the TOML file changes even when no data changes — large diffs in git.
**Why it happens:** JavaScript object key order follows insertion order; not alphabetical.
**How to avoid:** Sort species keys before stringifying: `manifest.species = Object.fromEntries(Object.entries(manifest.species).sort(([a], [b]) => a.localeCompare(b)))`. [ASSUMED: `@iarna/toml` follows insertion order — not explicitly tested, but standard JS behavior]
**Warning signs:** `git diff content/species-photos.toml` shows many reorderings after a re-run.

### Pitfall 10: Multiple photos per observation — seed picks which photo to use
**What goes wrong:** One observation can have 10+ photos (each with its own `photo_id` and `license_code`). The PHOTO-01 schema stores individual photos (each `[[photos]]` entry has a `photo_id`). The seed must decide which photos to take from each observation.
**Why it happens:** iNat observations represent a field event; multiple angles of the same bee get attached.
**How to avoid:** Take the first `photo` from each observation that passes the license filter. Stop once 3 total photos are collected across observations. Do not take multiple photos from a single observation (keeps diversity). [VERIFIED: live API call showed observation with 4+ photos]
**Warning signs:** TOML has 10+ photos for a single species all from one observation.

---

## Code Examples

### Fetch top-3 licensed photos for a species (WA-first)

```javascript
// Source: verified against live iNat API 2026-05-04
async function getTopPhotos(taxonId, maxCount = 3) {
  const waObs = await fetchObservations(taxonId, { place_id: 46, per_page: 10 });
  await delay(1000);
  const photos = extractLicensedPhotos(waObs, maxCount);

  if (photos.length < maxCount) {
    const globalObs = await fetchObservations(taxonId, { per_page: 10 });
    await delay(1000);
    const globalPhotos = extractLicensedPhotos(globalObs, maxCount);
    const seen = new Set(photos.map(p => p.photo_id));
    for (const p of globalPhotos) {
      if (!seen.has(p.photo_id) && photos.length < maxCount) photos.push(p);
    }
  }
  return photos;
}
```

### DuckDB CLI taxon_id lookup

```javascript
// Source: verified against data/beeatlas.duckdb 2026-05-04
import { execSync } from 'node:child_process';

function loadTaxonIds(dbPath) {
  const sql = `
    SELECT s.scientificName, b.taxon_id
    FROM checklist_data.species s
    LEFT JOIN inaturalist_data.canonical_to_taxon_id b
      ON LOWER(s.scientificName) = b.canonical_name
    UNION
    SELECT DISTINCT o.scientificName, b.taxon_id
    FROM ecdysis_data.occurrences o
    LEFT JOIN inaturalist_data.canonical_to_taxon_id b
      ON o.canonical_name = b.canonical_name
    WHERE o.canonical_name IS NOT NULL
  `;
  const json = execSync(`duckdb "${dbPath}" -json "${sql.replace(/\n\s+/g, ' ')}"`,
    { encoding: 'utf-8' });
  return new Map(JSON.parse(json).map(r => [r.scientificName, r.taxon_id]));
}
```

### @iarna/toml fill-only merge pattern

```javascript
// Source: verified via @iarna/toml@2.2.5 in /tmp 2026-05-04
import TOML from '@iarna/toml';
import { readFileSync, writeFileSync } from 'node:fs';

const manifest = existsSync(MANIFEST_PATH)
  ? TOML.parse(readFileSync(MANIFEST_PATH, 'utf-8'))
  : { species: {} };
manifest.species ??= {};

for (const species of allSpecies) {
  if (manifest.species[species.scientificName]) continue; // D-01: never overwrite
  manifest.species[species.scientificName] = { description: '', photos: [] };
}

// Sort for stable diffs
manifest.species = Object.fromEntries(
  Object.entries(manifest.species).sort(([a], [b]) => a.localeCompare(b))
);

writeFileSync(MANIFEST_PATH, TOML.stringify(manifest), 'utf-8');
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Build-time iNat fetch | Hand-edited TOML + out-of-band seed | Phase 79 scoping | Eliminates build flakiness and rate-limit risk in CI |
| Per-species photo URL construction in templates | Verbatim URL stored in TOML | PHOTO-04 requirement | URL drift detectable by `check-photo-availability.mjs` (Phase 82) |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Checklist-only species with no iNat occurrence records will have 0 results from the observations API (no taxa with 0 global observations were tested live) | iNat API Contract | Low risk — seed handles `results.length === 0` the same way; produces empty-photos entry |
| A2 | User-Agent format has no strict requirement from iNat; project email is sufficient for courtesy | iNat API Contract | Low risk — iNat documents recommended practices but doesn't enforce UA format |
| A3 | `@iarna/toml` ESM default import works via CJS interop in Node.js 22 (not tested in-project) | Library Choices | Medium risk — workaround exists (createRequire); test during Wave 0 |
| A4 | `TOML.stringify` follows JavaScript key insertion order (not sorted alphabetically) | Pitfall 9 | Low risk — behavior is documented JS semantics; sorting is straightforward fix |
| A5 | The `ecdysis_data.occurrences` table has `scientificName` column matching the `checklist_data.species.scientificName` casing | DuckDB query | Low risk — Phase 78 bridge table query uses `canonical_name` for join, not `scientificName` directly |

---

## Open Questions

1. **Photo selection per observation: first photo only, or best-licensed?**
   - What we know: each observation has 1–15+ photos, all usually under the same license as the observation.
   - What's unclear: should the seed take the first photo, or should it check individual photo `license_code` values and skip non-whitelisted photos within an observation?
   - Recommendation: check each `photo.license_code` individually (as shown in patterns). An observation with `license_code=cc-by` can still have individual photos with different licenses (not observed in testing, but API allows it).

2. **Empty photos entry: `photos = []` or omit the key entirely?**
   - What we know: `TOML.stringify` with `photos: []` produces `photos = [ ]`. With no `photos` key, it produces nothing.
   - What's unclear: which form is cleaner for Phase 80's `_data/photos.js` to handle.
   - Recommendation: Write `{ description: '' }` without a `photos` key for no-photo species. Phase 80 handles absent keys as empty arrays. Avoids `photos = [ ]` noise in the TOML.

3. **TOML file write strategy: incremental per-species or single write at end?**
   - What we know: D-01 fill-only + 735 species at ≤1 req/sec = ~12-25 min run; crash mid-run loses progress if single-write.
   - What's unclear: how often humans interrupt the seed mid-run.
   - Recommendation: Write TOML to disk every N species (e.g., every 50) AND at end. D-01 idempotency means re-running from a partial file is safe.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | validate-species.mjs, seed script | ✓ | (project-standard) | — |
| `@iarna/toml` | validate-species.mjs, seed | ✗ (not yet installed) | 2.2.5 | Must install: `npm install @iarna/toml` |
| `duckdb` CLI | seed taxon_id lookup | ✓ | 1.5.2 | `@duckdb/node-api` npm package |
| `public/data/species.json` | seed + validator | ✗ (Phase 78 output) | — | Run `cd data && uv run python run.py` first |
| `content/` directory | seed output | ✗ (doesn't exist) | — | `mkdirSync('content', { recursive: true })` |

**Missing dependencies with no fallback:**
- `@iarna/toml` package must be installed before Wave 1

**Missing dependencies with fallback:**
- `public/data/species.json` — seed and validator should degrade gracefully when absent; species cross-reference check should be skipped (warn-only mode)
- `content/` directory — seed creates it with `mkdirSync(..., { recursive: true })`

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 (existing) |
| Config file | `vite.config.ts` (shared config, `test.environment = 'happy-dom'`) |
| Quick run command | `npx vitest run src/tests/validate-species.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PHOTO-01 | TOML schema structure validates correctly | unit | `npx vitest run src/tests/validate-species.test.ts` | ❌ Wave 0 |
| PHOTO-02 | Bad license (`all-rights-reserved`) is rejected | unit | `npx vitest run src/tests/validate-species.test.ts` | ❌ Wave 0 |
| PHOTO-02 | `null` license is rejected | unit | same | ❌ Wave 0 |
| PHOTO-02 | Missing `license` field is rejected | unit | same | ❌ Wave 0 |
| PHOTO-02 | `cc-by-nc-nd` (not in whitelist) is rejected | unit | same | ❌ Wave 0 |
| PHOTO-02 | All 5 whitelisted licenses are accepted | unit | same | ❌ Wave 0 |
| PHOTO-03 | Missing `attribution` for `cc-by` photo is rejected | unit | same | ❌ Wave 0 |
| PHOTO-03 | Missing `attribution` for `cc0` is accepted | unit | same | ❌ Wave 0 |
| PHOTO-05 | Unknown scientificName → warning, exit 0 | unit | same | ❌ Wave 0 |
| PHOTO-05 | Known scientificName with valid data → no error | unit | same | ❌ Wave 0 |
| PHOTO-06 | `npm run build` with bad license → nonzero exit | integration (subprocess) | `npm run build 2>&1 \| grep 'Validation failed'` | ❌ Wave 0 |
| PHOTO-06 | `npm run build` with valid TOML → exit 0 | integration (subprocess) | `npm run build` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npx vitest run src/tests/validate-species.test.ts`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/tests/validate-species.test.ts` — covers PHOTO-01..03, PHOTO-05, PHOTO-08
- [ ] `scripts/validate-species.mjs` — must export `validateSpeciesPhotos` function before tests can import
- [ ] `content/` directory — created by seed script at runtime; no test scaffold needed
- [ ] `@iarna/toml` npm install — `npm install @iarna/toml`

---

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | n/a |
| V3 Session Management | no | n/a |
| V4 Access Control | no | n/a |
| V5 Input Validation | yes | Whitelist-based license validation; TOML parse only (no eval); `attribution` rendered verbatim (not innerHTML per PHOTO-03) |
| V6 Cryptography | no | n/a |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via attribution field | Tampering | Phase 80 renders `attribution` as text node, never `innerHTML` (PHOTO-03 requirement) |
| TOML injection via scientificName | Tampering | `@iarna/toml` stringify handles all quoting; no string interpolation |
| iNat URL substitution | Spoofing | URLs stored verbatim; `check-photo-availability.mjs` (Phase 82) validates they remain accessible |

---

## Sources

### Primary (HIGH confidence)
- Live iNat API call (2026-05-04): `GET https://api.inaturalist.org/v1/observations?taxon_id=52775&quality_grade=research&order_by=votes&place_id=46&per_page=10` — photo object shape, license_code values, URL format, per_page=200 limit
- Live iNat places API: `GET https://api.inaturalist.org/v1/places/46` — confirmed Washington state
- `@iarna/toml@2.2.5` installed in `/tmp` and tested (2026-05-04) — stringify output, quoted key behavior, round-trip correctness
- DuckDB `data/beeatlas.duckdb` queried directly (2026-05-04) — 735/735 species in bridge table, all non-null taxon_ids
- `scripts/validate-schema.mjs` read locally — CLI shape, exit-code convention, error format
- `package.json` read locally — build chain, dependency versions
- `data/inaturalist_pipeline.py` read locally — rate-limit pattern, `_inat_get_with_retry`
- `data/resolve_taxon_ids.py` read locally — DuckDB bridge table pattern, fill-only logic

### Secondary (MEDIUM confidence)
- npm registry: `@iarna/toml` version 2.2.5, published 2020-04-22
- npm registry: `p-limit` version 7.3.0; `duckdb` CLI `@duckdb/node-api` version 1.5.2-r.1
- iNat forum thread: photo URL size variants (`square`, `small`, `medium`, `large`, `original`) and string-replace pattern

### Tertiary (LOW confidence)
- iNat API documentation (official page unreachable via WebFetch — 403); behavior inferred from live API calls and community forum

---

## Metadata

**Confidence breakdown:**
- iNat API contract: HIGH — verified via live calls with real data
- `@iarna/toml` behavior: HIGH — verified by install and testing in `/tmp`
- DuckDB bridge table coverage: HIGH — verified against production database
- Build chain wiring: HIGH — read `package.json` directly
- Vitest test patterns: HIGH — read existing test files

**Research date:** 2026-05-04
**Valid until:** 2026-06-04 (iNat API shape rarely changes; `@iarna/toml` is stable)

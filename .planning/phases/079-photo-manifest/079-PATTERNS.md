# Phase 79: Photo Manifest — Pattern Map

**Mapped:** 2026-05-04
**Files analyzed:** 6 new/modified files
**Analogs found:** 5 / 6

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `scripts/validate-species.mjs` | utility (build-chain validator) | request-response (CLI) | `scripts/validate-schema.mjs` | exact |
| `scripts/seed-species-photos.mjs` | utility (one-shot seed) | batch + file-I/O | `scripts/validate-schema.mjs` (structure); `data/inaturalist_pipeline.py` (rate-limit/iNat pattern) | role-match |
| `src/tests/validate-species.test.ts` | test | request-response | `src/tests/url-state.test.ts` (pure function tests); `src/tests/bee-atlas.test.ts` (readFileSync pattern) | exact |
| `content/species-photos.toml` | config/manifest | file-I/O | none — new artifact type | no analog |
| `src/tests/fixtures/species-photos/*.toml` | test fixture | file-I/O | inline TOML strings in `url-state.test.ts` (preferred over fixture files per research) | partial |
| `package.json` | config | — | `package.json` (modify existing) | exact |

---

## Pattern Assignments

### `scripts/validate-species.mjs` (utility, CLI request-response)

**Analog:** `scripts/validate-schema.mjs`

**Imports pattern** (lines 1–18 of validate-schema.mjs):
```javascript
import { asyncBufferFromFile, asyncBufferFromUrl, parquetMetadataAsync } from 'hyparquet';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
```
For validate-species.mjs, substitute hyparquet imports with `@iarna/toml`:
```javascript
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import TOML from '@iarna/toml';
```
The `new URL('../public/data/', import.meta.url).pathname` path-resolution pattern from line 19 of validate-schema.mjs gives the project-root-relative path idiom for ESM scripts.

**Graceful-degradation pattern** (validate-schema.mjs lines 54–57):
```javascript
const useLocal = existsSync(join(ASSETS_DIR, 'occurrences.parquet'));
if (!useLocal) {
  console.log('No local parquet found -- validating against production CloudFront');
}
```
Mirror for species.json: if `public/data/species.json` absent, skip the cross-reference check and warn. TOML license/attribution validation still runs (Pitfall 7 in RESEARCH.md).

**Core accumulate-then-exit pattern** (validate-schema.mjs lines 59–91 and 120–123):
```javascript
let failed = false;

for (const [filename, expectedCols] of Object.entries(EXPECTED)) {
  // ... per-item check
  if (missing.length > 0) {
    console.error(`x ${filename}: missing columns: ${missing.join(', ')}`);
    failed = true;
  } else {
    console.log(`ok ${filename}`);
  }
}

if (failed) {
  console.error('\nSchema validation failed.');
  process.exit(1);
}
```
Adapt: accumulate `errors[]` and `warnings[]` arrays; print warnings to stderr with `warn:` prefix; print errors to stderr with `error:` prefix; call `process.exit(1)` only when `errors.length > 0`.

**CLI-only guard for exported-function compatibility:**

validate-schema.mjs has NO exported function — it runs everything at top level. validate-species.mjs MUST differ: the core logic is exported as `validateSpeciesPhotos(tomlSource, speciesJsonArray)` returning `{ errors, warnings }`. The CLI path (readFileSync + process.exit) runs unconditionally at module load, which works for CLI use but breaks Vitest imports. The correct pattern is to wrap CLI code in:
```javascript
// Only run as CLI — check import.meta.url vs process.argv[1]
const isCli = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isCli) { /* read files, call validateSpeciesPhotos, process.exit */ }
```
This is the critical difference from validate-schema.mjs.

**Error/success message format** (validate-schema.mjs lines 88–90):
```javascript
console.error(`x ${filename}: missing columns: ${missing.join(', ')}`);
console.log(`ok ${filename}`);
```
Follow this `x <subject>: <message>` / `ok <subject>` convention.

---

### `scripts/seed-species-photos.mjs` (utility, batch + file-I/O)

**Analog (structure):** `scripts/validate-schema.mjs`
**Analog (iNat/rate-limit patterns):** `data/inaturalist_pipeline.py` (not directly importable; patterns extracted here)

**Imports pattern:**
```javascript
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import TOML from '@iarna/toml';
```

**Path resolution idiom** (ESM, same as validate-schema.mjs line 19):
```javascript
const ROOT = new URL('..', import.meta.url).pathname;
// or equivalently:
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
```
validate-schema.mjs uses `new URL('../public/data/', import.meta.url).pathname` — follow the same `new URL(...)` form for consistency.

**DuckDB CLI invocation pattern:**
```javascript
import { execSync } from 'node:child_process';

function loadTaxonIds(dbPath) {
  const sql = `SELECT ...`;
  const json = execSync(`duckdb "${dbPath}" -json "${sql.replace(/\n\s+/g, ' ')}"`,
    { encoding: 'utf-8' });
  return new Map(JSON.parse(json).map(r => [r.scientificName, r.taxon_id]));
}
```
The `-json` flag outputs a clean JSON array. Verified against `data/beeatlas.duckdb` table `inaturalist_data.canonical_to_taxon_id`.

**Rate-limiting pattern** (no third-party lib):
```javascript
await new Promise(r => setTimeout(r, 1000));  // ≤1 req/sec
```
Place after each `fetch()` call in the per-species loop. Sequential `for...of` loop — no concurrency.

**Fill-only (D-01) guard pattern:**
```javascript
for (const { scientificName } of speciesJson) {
  if (manifest.species[scientificName]) continue;  // D-01: humans always win
  // ... fetch and write
}
```

**TOML stable-diff sort before write:**
```javascript
manifest.species = Object.fromEntries(
  Object.entries(manifest.species).sort(([a], [b]) => a.localeCompare(b))
);
writeFileSync(MANIFEST, TOML.stringify(manifest), 'utf-8');
```

**Fail-fast for missing preconditions** (mirrors validate-schema.mjs graceful-degradation but inverted — seed is not in CI so can be strict):
```javascript
if (!existsSync(SPECIES_JSON)) {
  console.error('Run the data pipeline first: cd data && uv run python run.py');
  process.exit(1);
}
mkdirSync(dirname(MANIFEST), { recursive: true });
```

**iNat fetch + photo extraction:**

Key pitfall (RESEARCH.md Pitfall 1): filter `photo.license_code`, NOT `obs.license_code`.
Key pitfall (RESEARCH.md Pitfall 2): transform `photo.url` from `square` to `large` at seed time:
```javascript
url.replace(/\/square(\.\w+)$/, '/large$1')
```
Key pitfall (RESEARCH.md Pitfall 3): guard against missing `results` key:
```javascript
const data = await resp.json();
const results = data.results ?? [];
```

---

### `src/tests/validate-species.test.ts` (test, request-response)

**Analog:** `src/tests/url-state.test.ts` (inline test data, pure function, describe/test structure)

**Imports pattern** (url-state.test.ts lines 1–5):
```typescript
import { test, expect, describe } from 'vitest';
import { buildParams, parseParams } from '../url-state.ts';
```
Adapt:
```typescript
import { test, expect, describe } from 'vitest';
import { validateSpeciesPhotos } from '../../scripts/validate-species.mjs';
```
Note the two-level `../../` path because tests are in `src/tests/` and the script is in `scripts/`.

**Inline test-data pattern** (url-state.test.ts):
The project prefers inline test data over external fixture files — url-state.test.ts defines all its data as inline constants. RESEARCH.md confirms this is viable for TOML strings. Use inline TOML string constants rather than `readFileSync` for fixture TOMLs.
```typescript
const BAD_LICENSE_TOML = `
[species."Osmia lignaria"]
description = ""
[[species."Osmia lignaria".photos]]
observation_id = 123
photo_id = 456
url = "https://inaturalist-open-data.s3.amazonaws.com/photos/456/large.jpg"
caption = ""
attribution = "(c) Test User"
license = "all-rights-reserved"
ordering = 1
`;

const GOOD_SPECIES_JSON = [
  { scientificName: 'Osmia lignaria', slug: 'osmia-lignaria', occurrence_count: 5, on_checklist: true, canonical_name: 'osmia lignaria' }
];
```

**describe/test structure** (url-state.test.ts lines 25–35):
```typescript
describe('validateSpeciesPhotos', () => {
  test('rejects all-rights-reserved license', () => {
    const { errors } = validateSpeciesPhotos(BAD_LICENSE_TOML, GOOD_SPECIES_JSON);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('invalid license');
  });
});
```

**readFileSync-for-source-analysis pattern** (bee-atlas.test.ts lines 1–6):
```typescript
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// usage:
const src = readFileSync(resolve(__dirname, '../../scripts/validate-species.mjs'), 'utf-8');
```
Use this pattern only for the build-chain integration test that checks `package.json` wiring (PHOTO-06 subprocess test is optional; the `readFileSync` source-analysis approach avoids a subprocess).

**Test environment:** `happy-dom` (set in `vite.config.ts` line 18). No special per-file config needed — the global vitest config covers `src/tests/`.

---

### `content/species-photos.toml` (manifest, file-I/O)

**No analog** — first TOML manifest in the project. Structure is defined by PHOTO-01 and locked by `@iarna/toml` stringify output:

```toml
# Underscore-separated integers (e.g., observation_id = 33_289_514) are valid TOML.
# This file is machine-generated by scripts/seed-species-photos.mjs (fill-only).
# Human edits to existing entries are never overwritten by re-running the seed.

[species."Andrena astragali"]
description = ""
[[species."Andrena astragali".photos]]
observation_id = 33_289_514
photo_id = 52_274_835
url = "https://inaturalist-open-data.s3.amazonaws.com/photos/52274835/large.jpg"
caption = ""
attribution = "no rights reserved"
license = "cc0"
ordering = 1
```

Key points:
- Top-level key is `species`, not `photos` directly
- Per-species key uses raw `scientificName` (may contain spaces, parens, periods — `@iarna/toml` quotes them)
- `[[species."...".photos]]` is a TOML table-array — `@iarna/toml` produces this automatically from `{ photos: [{...}] }`
- Species with no photos: write `{ description: '' }` without a `photos` key (cleaner than `photos = [ ]`)

---

### `package.json` (config, modify)

**Current build chain** (package.json lines 17–26):
```json
"scripts": {
  "validate-schema": "node scripts/validate-schema.mjs",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "build": "npm run validate-schema && npm run typecheck && eleventy"
}
```

**After this phase** — add `validate-species` entry and insert it in `build` after `validate-schema`:
```json
"scripts": {
  "validate-schema": "node scripts/validate-schema.mjs",
  "validate-species": "node scripts/validate-species.mjs",
  "typecheck": "tsc --noEmit",
  "test": "vitest run",
  "build": "npm run validate-schema && npm run validate-species && npm run typecheck && eleventy"
}
```

Also add to `dependencies` (not `devDependencies` — validator runs in build chain):
```json
"dependencies": {
  "@iarna/toml": "^2.2.5",
  "lit": "^3.2.1",
  ...
}
```

---

## Shared Patterns

### Node ESM path resolution
**Source:** `scripts/validate-schema.mjs` line 19
**Apply to:** Both new scripts
```javascript
const ASSETS_DIR = new URL('../public/data/', import.meta.url).pathname;
```
Use `new URL('<relative-path>', import.meta.url).pathname` for all repo-root-relative paths in `.mjs` scripts. This avoids `__dirname` (not available in native ESM) and `process.cwd()` (fragile if script is called from a different directory).

### Error accumulation + exit pattern
**Source:** `scripts/validate-schema.mjs` lines 59, 120–123
**Apply to:** `scripts/validate-species.mjs` (CLI wrapper)
```javascript
let failed = false;
// ... accumulate errors, set failed = true
if (failed) {
  console.error('\nSchema validation failed.');
  process.exit(1);
}
```
For validate-species.mjs: use `errors[]` array from the exported function, then `if (errors.length > 0) process.exit(1)`.

### Graceful degradation when data files absent
**Source:** `scripts/validate-schema.mjs` lines 54–57, 70–74
**Apply to:** `scripts/validate-species.mjs` (cross-reference check only)
```javascript
const useLocal = existsSync(join(ASSETS_DIR, 'occurrences.parquet'));
if (!useLocal) {
  console.log('No local parquet found -- validating against production CloudFront');
}
// ...
} else if (!useLocal && /403|404/.test(e.message)) {
  console.warn(`! ${filename}: not available on CloudFront yet (pipeline not run) -- skipping`);
```
For validate-species.mjs: if `species.json` absent, skip the unknown-name cross-reference check (emit a single `warn:` line) but still validate licenses and attributions in the TOML.

### Vitest test structure
**Source:** `src/tests/url-state.test.ts` lines 1–4, 25–35
**Apply to:** `src/tests/validate-species.test.ts`
```typescript
import { test, expect, describe } from 'vitest';
// inline test data as top-level constants
describe('featureName', () => {
  test('rejects bad input', () => {
    const result = functionUnderTest(badInput);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
```

### readFileSync + __dirname pattern for source-file assertions
**Source:** `src/tests/bee-atlas.test.ts` lines 1–6
**Apply to:** Any test in `src/tests/validate-species.test.ts` that needs to read source files (e.g., checking that the script exports the required function name)
```typescript
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(__dirname, '../../scripts/validate-species.mjs'), 'utf-8');
```

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `content/species-photos.toml` | manifest | file-I/O | First TOML manifest in the project; no existing TOML artifact to copy from. Structure is fully specified by PHOTO-01 schema and `@iarna/toml` stringify output verified in RESEARCH.md. |

---

## Metadata

**Analog search scope:** `scripts/`, `src/tests/`, `package.json`, `vite.config.ts`
**Files read:** `scripts/validate-schema.mjs`, `src/tests/url-state.test.ts`, `src/tests/bee-atlas.test.ts`, `package.json`, `vite.config.ts`
**Pattern extraction date:** 2026-05-04

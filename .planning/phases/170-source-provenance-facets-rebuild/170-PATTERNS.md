# Phase 170: Source → Provenance Facets Rebuild - Pattern Map

**Mapped:** 2026-06-26
**Files analyzed:** 16 modified + 1 new test assertion
**Analogs found:** 17 / 17 (brownfield refactor — each file is its own analog; the "self-as-template" pattern is the existing `source`/`hiddenSources` plumbing being renamed in place)

> **Brownfield note:** This phase has essentially **one new artifact** (the PROV-03 occ_id-coupling Vitest assertion). Everything else is an in-place rename/decomposition of existing code, so the "closest analog" for each modified file is **its own current implementation** — the planner copies the existing shape and substitutes vocabulary. The three load-bearing templates are: (a) the `hiddenSources` filter-dimension plumbing → `hiddenTiers`, (b) the `src=` URL serialization → `tier=`, (c) the triplicated occ_id CASE → asserted (not changed) by the new test.

## File Classification

### Data leg (Wave A — ships + publishes alone)

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------|------|-----------|----------------|---------------|
| `data/dbt/models/intermediate/int_combined.sql` | model (intermediate) | transform | self — existing 5 arm SELECTs (the `'<arm>' AS source` literal + existing `is_provisional` per-arm constant) | exact (self) |
| `data/dbt/models/marts/occurrences.sql` | model (mart) | transform | self — `j.source` projection (:86) | exact (self) |
| `data/dbt/models/marts/schema.yml` | config (contract) | n/a | self — `- name: source` row + the two `not_null where:` predicates | exact (self) |
| `data/collectors_export.py` | service (export) | batch | self — 5 `o.source` CASE predicates (:48-68) | exact (self) |
| `data/sqlite_export.py` | service (export) | batch | self — `_GEO_COLS` positional array, `source` at index 6 (:479) | exact (self) |
| `data/dbt/models/marts/occurrence_places.sql` | model (bridge) | transform | **cross-check only** — occ_id CASE (:43-48), unchanged (D-07) | n/a (asserted) |

### Frontend leg (Wave B — one atomic commit)

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------|------|-----------|----------------|---------------|
| `src/url-state.ts` | utility (serialization) | transform | self — `src=` serialize/parse + `VALID_SOURCES`/`SourceKey` | exact (self) |
| `src/filter.ts` | service (query builder) | CRUD/transform | self — `hiddenSources` field, source-filter SQL (:397-407), `OccurrenceProperties.source` | exact (self) |
| `src/features.ts` | utility (geo decode) | transform | self — `row[6] as source` positional decode | exact (self) |
| `src/style.ts` | utility (map paint) | transform | self — `_occurrencePointPaint` match on `['get','source']` (:88-97) | exact (self) |
| `src/bee-occurrence-detail.ts` | component | request-response | self — variant dispatch on `row.source` (:465-475) | exact (self) |
| `src/bee-pane.ts` | component (presenter) | event-driven | self — `_renderSources()` 5-toggle list + `_onSourceToggle` | exact (self) |
| `src/bee-map.ts` | component (presenter) | event-driven | self — `filterState` default literal, `_visibleBySource` (:588-592) | exact (self) |
| `src/bee-atlas.ts` | provider (state owner) | event-driven | self — `hiddenSources` plumbing, `_onSourceFilterChanged` | exact (self) |
| `src/occurrence.ts` | utility (id domain) | transform | **unchanged** (D-07) — `occIdFromRow` is the canonical CASE order the test asserts | n/a (asserted) |
| `src/tests/occurrence.test.ts` | test | n/a | self — existing `BASE_ROW` + `describe`/`test` structure | exact (self) — **the one NEW assertion lands here** |
| `docs/domain-model.md` | doc | n/a | self — "provenance" framing + `inat_obs` refs | exact (self) |

## Pattern Assignments

### `src/filter.ts` — `hiddenSources` → `hiddenTiers` (the template filter dimension)

**Analog:** self (current `hiddenSources` plumbing is the exact shape `hiddenTiers` copies).

**FilterState field** (`src/filter.ts:27`) — a `Set`-typed required field, empty = no filter:
```typescript
hiddenSources: Set<SourceKey>; // empty Set = no source filter (show all)
// becomes:
hiddenTiers: Set<TierKey>; // empty Set = no tier filter (show all)
```
> Per `project_filterstate_required_field_contract`: this is a **required** field rename — every `FilterState` literal (incl. `bee-map.ts` default) must update; gate with `tsc --noEmit`, not just `npm test`.

**Source-filter SQL clause** (`src/filter.ts:393-407`) — allowlist-driven `IN` clause with the all-hidden `1 = 0` sentinel and the T-164-SQL security comment. Copy the structure verbatim, swap to `VALID_TIERS = ['atlas','other']` and `o.tier`:
```typescript
if (f.hiddenSources.size > 0) {
  const VALID_SOURCES: SourceKey[] = ['ecdysis', 'waba_sample', 'waba_specimen', 'inat_obs', 'checklist'];
  const visibleSources = VALID_SOURCES.filter(s => !f.hiddenSources.has(s));
  if (visibleSources.length === 0) { occurrenceClauses.push('1 = 0'); }
  else {
    const list = visibleSources.map(s => `'${s}'`).join(',');
    occurrenceClauses.push(`o.source IN (${list})`);
  }
}
```
**Security invariant to preserve (T-164-SQL):** interpolated tokens come ONLY from the hardcoded `VALID_TIERS` allowlist, never user input. Keep the comment.

**`OccurrenceProperties.source`** (`:33`) → `tier: string`. **`OccurrenceRow`** (`:76`) `source` union → add `tier` + `record_type`; update `OCCURRENCE_COLUMNS` (`:98`) `'source'` → `'tier', 'record_type'` (the SELECT projection must match the contract).

---

### `src/url-state.ts` — `src=` → `tier=` (the template URL serialization)

**Analog:** self (the `src=` visible-subset encoding is the exact template `tier=` mirrors).

**Type + allowlist** (`:31,33`):
```typescript
export type SourceKey = 'ecdysis' | 'waba_sample' | 'waba_specimen' | 'inat_obs' | 'checklist';
const VALID_SOURCES = new Set<SourceKey>([...]);
// add alongside (keep SourceKey for src= back-compat parse):
export type TierKey = 'atlas' | 'other';
const VALID_TIERS = new Set<TierKey>(['atlas', 'other']);
```

**buildParams serialize** (`:94-100`) — write the VISIBLE subset, with the `none` sentinel for all-hidden:
```typescript
if (ui.hiddenSources && ui.hiddenSources.size > 0) {
  const visibleSources = [...VALID_SOURCES].filter(s => !ui.hiddenSources!.has(s)).sort();
  params.set('src', visibleSources.length > 0 ? visibleSources.join(',') : 'none');
}
```
Mirror exactly as `tier=` over `VALID_TIERS`. **No longer emit `src=`** (back-compat parse only).

**parseParams parse** (`:239-254`) — the anti-blank guard is load-bearing; copy it for `tier=`:
```typescript
const srcRaw = p.get('src');
let hiddenSources: Set<SourceKey> | undefined;
if (srcRaw === 'none') {
  hiddenSources = new Set<SourceKey>(VALID_SOURCES);          // explicit all-hidden sentinel
} else if (srcRaw) {
  const visible = new Set(srcRaw.split(',').filter(s => VALID_SOURCES.has(s as SourceKey)) as SourceKey[]);
  if (visible.size > 0) {                                     // garbage (visible=∅) → NO filter, never all-hidden
    const hidden = new Set([...VALID_SOURCES].filter(s => !visible.has(s)));
    hiddenSources = hidden.size > 0 ? hidden : undefined;
  }
}
```
**`src=` back-compat (legacy → tier, 5→2 fold per D-02):** when `src=` present and `tier=` absent, map each legacy token through `tierOf` (ecdysis/waba_sample/waba_specimen → `atlas`; inat_obs/checklist → `other`), then `hiddenTiers = {atlas,other} \ visibleTiers`. `src=none` → both tiers hidden. Lossy by design (see RESEARCH "URL Contract").

---

### `src/style.ts` — symbology by `tier` (D-08)

**Analog:** self (`_occurrencePointPaint`, `:88-97`). This is the **only** source-reading paint; the cluster paint (`:40-85`) is recency-aggregate-only — leave unchanged.
```typescript
'circle-color': [
  'match', ['get', 'source'],
  'checklist', '#2c7a2c',
  ['match', ['get', 'recencyTier'], 'thisYear', colors.thisYear, 'lastYear', colors.lastYear, colors.earlier],
],
// becomes (D-08): atlas keeps recency gradient; other (incl. former checklist green) muted
'circle-color': [
  'match', ['get', 'tier'],
  'other', '<MUTED_COLOR>',
  ['match', ['get', 'recencyTier'], 'thisYear', colors.thisYear, 'lastYear', colors.lastYear, colors.earlier],
],
```
Exact muted color/opacity is Claude's discretion. **Style-cache invariant (CLAUDE.md):** this changes only the paint *expression*, not the cache-bypass logic — do not touch the cache.

---

### `src/bee-occurrence-detail.ts` — card by `record_type` (D-09, orthogonal to tier)

**Analog:** self (variant dispatch, `:465-475`). Minimal rewrite = swap 4 string literals; `isProvisional`/`isSpecimenBacked` predicates read `is_provisional`/`ecdysis_id` (NOT source) — unchanged.
```typescript
isProvisional(row) ? this._renderProvisional(row)
  : row.source === 'checklist' ? this._renderChecklist(row)
  : row.source === 'waba_specimen' ? this._renderWabaSpecimen(row)
  : row.source === 'inat_obs' ? this._renderInatObs(row)
  : this._renderSampleOnly(row)
// becomes: row.record_type === '<checklist value>' / '<waba_specimen value>' / 'inat_expert' / else
```

---

### `src/tests/occurrence.test.ts` — NEW PROV-03 coupling assertion (the genuinely new artifact)

**Analog:** existing `occurrence.test.ts` structure (`BASE_ROW` literal :6, `describe`/`test`/`expect` imports :1). Add the new test in the same file; extend `BASE_ROW` (`:37` `source: null` → `tier`/`record_type`).

**The three coupled CASE sites the test asserts (all currently identical, priority `ecdysis → inat → inat_obs → checklist`):**

1. `src/occurrence.ts:23-30` (`occIdFromRow`) — the canonical TS order:
```typescript
if (row.ecdysis_id != null) return `ecdysis:${row.ecdysis_id}`;
if (row.observation_id != null) return `inat:${row.observation_id}`;
if (row.specimen_observation_id != null) return `inat_obs:${row.specimen_observation_id}`;
if (row.checklist_id != null) return `checklist:${row.checklist_id}`;
```
2. `src/filter.ts:108-114` (`OCC_ID_SQL_CASE`, exported — import it in the test):
```typescript
"WHEN o.ecdysis_id IS NOT NULL THEN 'ecdysis:' || o.ecdysis_id " +
"WHEN o.observation_id IS NOT NULL THEN 'inat:' || o.observation_id " +
"WHEN o.specimen_observation_id IS NOT NULL THEN 'inat_obs:' || o.specimen_observation_id " +
"WHEN o.checklist_id IS NOT NULL THEN 'checklist:' || o.checklist_id "
```
3. `data/dbt/models/marts/occurrence_places.sql:43-48` (`readFileSync` it in the test):
```sql
CASE
    WHEN j.ecdysis_id IS NOT NULL THEN 'ecdysis:' || j.ecdysis_id
    WHEN j.observation_id IS NOT NULL THEN 'inat:' || j.observation_id
    WHEN j.specimen_observation_id IS NOT NULL THEN 'inat_obs:' || j.specimen_observation_id
    WHEN j.checklist_id IS NOT NULL THEN 'checklist:' || j.checklist_id
END AS occ_id,
```
Assertion shape: `extractCaseOrder(sql)` regex `/THEN\s+'([a-z_]+):'/g` → array, assert `.toEqual(['ecdysis','inat','inat_obs','checklist'])` for all three. **D-07/D-11:** the test asserts coupling WITHOUT changing any CASE — only the `record_type` *value* `inat_obs`→`inat_expert` changes; the occ_id prefix `inat_obs:` stays.

---

### Data-leg models (`int_combined.sql`, `occurrences.sql`, `schema.yml`)

**Analog:** self. Each `int_combined.sql` arm already projects a per-arm `source` literal AND a per-arm `is_provisional` constant — copy that "hardcoded constant per arm" pattern for `tier` + `record_type` (D-05: the arm SELECT is the ONLY place that knows the arm→tier mapping):
```sql
'inat_obs'  AS source,           -- arm 4, :261
-- becomes:
'other'        AS tier,
'inat_expert'  AS record_type,
```
`occurrences.sql:86` `j.source,` → `j.tier, j.record_type,`. `schema.yml` drop `- name: source`, add `tier`+`record_type` rows; rewrite the two `not_null where:` predicates (`:99,107`) in record_type/tier terms (net contract change +1 col — count `schema.yml` at plan time, do not trust memory).

## Shared Patterns

### Allowlist-before-interpolation (SQL injection guard — T-164-SQL/IV)
**Source:** `src/filter.ts:394-405`, `src/url-state.ts:246`
**Apply to:** the new `tier=` URL parse AND the tier-filter SQL.
Tokens are filtered against the compile-time `VALID_TIERS` set before any string interpolation; garbage tokens are dropped on parse, never reaching SQL. Preserve the existing security comments.

### Anti-blank `none` sentinel
**Source:** `src/url-state.ts:96-99, 241-253`
**Apply to:** `tier=` serialization/parse.
All-hidden = explicit `tier=none`; a list of only-unknown tokens (visible=∅) = NO filter (never all-hidden) — a crafted param cannot blank every view.

### Positional coupling ships atomically (edit both files in one commit)
**Source:** `data/sqlite_export.py` `_GEO_COLS` (index 6) ↔ `src/features.ts` `row[6]` decode (inline-documented).
**Apply to:** the `source`→`tier` index-6 swap — both files in the SAME commit, or the map silently mis-colors (reads `year` as tier). Recommendation: carry only `tier` (not `record_type`) on the geo_blob — page-weight budget (`project_duckdb_wasm_direction`); the card gets `record_type` from the full wa-sqlite row query.

### State-down / event-up presenter flow
**Source:** `<bee-atlas>` owns `FilterState`; `bee-map`/`bee-pane` receive `.hiddenSources` as a property and emit `source-filter-changed` upward (CLAUDE.md State ownership invariant).
**Apply to:** `hiddenTiers` flows the same path; rename `source-filter-changed` → `tier-filter-changed`, `_onSourceFilterChanged` → `_onTierFilterChanged`.

### Required-field tsc gate
**Source:** `project_filterstate_required_field_contract` memory.
**Apply to:** every `FilterState` literal touching `hiddenSources`. Run `npx tsc --noEmit` as the post-merge gate — Vitest can pass while `tsc` fails on a missed literal.

## No Analog Found

None. Every file is a brownfield in-place edit; the closest analog is always the file's own current implementation. The single new behavior (cross-file CASE-order assertion) reuses the existing `occurrence.test.ts` harness.

## Do-Not-Touch (false positives / D-07 protected)

| Site | Reason |
|------|--------|
| `data/dbt/models/marts/checklist.sql` | separate mart, its own `source='checklist'` constant (RESEARCH Pitfall 4) |
| `data/dbt/models/intermediate/int_synonyms.sql` | `source` = synonym-provenance, unrelated |
| `src/occurrence.ts` `occIdFromRow`/`parseOccId`/`OCC_ID_SQL_CASE` + `occurrence_places.sql` CASE | D-07 — occ_id prefix `inat_obs:` stays; CASE asserted not changed |
| `bee-atlas.ts:982-984,1013-1015` `parseOccId().source` | this is the occ_id PREFIX, not the column — do not rename |
| `style.ts` cluster paint (`:40-85`) | recency-aggregate-only, does not read source/tier |

## Metadata

**Analog search scope:** `src/*.ts`, `src/tests/`, `data/dbt/models/{intermediate,marts}/`, `data/*.py`
**Files scanned:** filter.ts, occurrence.ts, url-state.ts, style.ts, occurrence.test.ts, occurrence_places.sql (+ inventory from RESEARCH consumer table)
**Pattern extraction date:** 2026-06-26

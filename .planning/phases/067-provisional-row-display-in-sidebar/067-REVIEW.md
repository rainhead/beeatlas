---
phase: 067-provisional-row-display-in-sidebar
reviewed: 2026-04-20T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - data/export.py
  - scripts/validate-schema.mjs
  - frontend/src/filter.ts
  - frontend/src/tests/filter.test.ts
  - frontend/src/bee-occurrence-detail.ts
  - frontend/src/tests/bee-sidebar.test.ts
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 067: Code Review Report

**Reviewed:** 2026-04-20
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

This phase adds `is_provisional` flag support end-to-end: the DuckDB export SQL gains ARM 2 (unmatched WABA observations), `validate-schema.mjs` gains the new column, `filter.ts` gains `is_provisional` and related fields in `OccurrenceRow`/`OCCURRENCE_COLUMNS`, and `bee-occurrence-detail.ts` gains a `_renderProvisional` branch. Tests cover both render branches and SQL shape.

The code is largely correct and well-structured. Three warnings require attention before the phase is complete.

## Warnings

### WR-01: `_renderProvisional` renders an unconditional iNat link with a potentially-null `specimen_observation_id`

**File:** `frontend/src/bee-occurrence-detail.ts:244-247`

**Issue:** The `_renderProvisional` method renders the "View WABA observation" anchor unconditionally, interpolating `row.specimen_observation_id` directly into the href. By construction ARM 2 rows should always have `specimen_observation_id` set (it is `sob.waba_obs_id`), but the TypeScript type for `OccurrenceRow.specimen_observation_id` is `number | null`. If a null somehow arrives — e.g. via a future schema change, a bad test fixture, or a filter path that mixes rows — the rendered link becomes `https://www.inaturalist.org/observations/null`, which is a broken external URL silently sent to users.

**Fix:** Guard the link, consistent with the pattern already used in `_renderSpecimenGroup` (line 198):
```typescript
private _renderProvisional(row: OccurrenceRow) {
  const taxonEl = row.specimen_inat_taxon_name
    ? html`<em>${row.specimen_inat_taxon_name}</em>`
    : html`<span class="hint">identification pending</span>`;
  return html`
    <div class="panel-content sample-dot-detail">
      <div class="inat-id-label">iNat ID: ${taxonEl} ${this._renderQualityBadge(row.specimen_inat_quality_grade)}</div>
      <div class="event-date">${this._formatSampleDate(row.date)}</div>
      ${row.host_inat_login != null ? html`<div class="event-observer">${row.host_inat_login}</div>` : ''}
      ${row.specimen_count != null && !isNaN(row.specimen_count)
        ? html`<div class="event-count">${row.specimen_count} specimen${row.specimen_count === 1 ? '' : 's'} collected</div>`
        : ''}
      ${row.elevation_m != null
        ? html`<div class="event-elevation">${Math.round(row.elevation_m)} m</div>`
        : ''}
      ${row.specimen_observation_id != null
        ? html`<div class="event-inat">
            <a href="https://www.inaturalist.org/observations/${row.specimen_observation_id}"
               target="_blank" rel="noopener"
               aria-label="View WABA observation on iNaturalist">View WABA observation</a>
          </div>`
        : ''}
    </div>
  `;
}
```

---

### WR-02: `OCCURRENCE_COLUMNS` is missing `specimen_inat_login`, `specimen_inat_genus`, and `specimen_inat_family`

**File:** `frontend/src/filter.ts:55-61`

**Issue:** `validate-schema.mjs` lists `specimen_inat_login`, `specimen_inat_genus`, and `specimen_inat_family` as expected parquet columns (lines 36-37), and `export.py` writes them into every row of ARM 1 and ARM 2. However, none of these three columns appear in `OCCURRENCE_COLUMNS` or `OccurrenceRow`. This means:

1. `queryTablePage` and `queryAllFiltered` never SELECT these columns from SQLite, so they are always absent from returned rows.
2. `OccurrenceRow` has no field for them, so consumer code cannot access them without a type cast.

Currently `bee-occurrence-detail.ts` does not use these columns, so there is no visible runtime breakage today. But the columns are in the data and omitting them from `OCCURRENCE_COLUMNS` is a latent gap that will bite any future code that tries to read `specimen_inat_login` (e.g. to display the collector for a provisional row).

**Fix:** Add the three columns to `OccurrenceRow` and `OCCURRENCE_COLUMNS`:
```typescript
// In OccurrenceRow:
specimen_inat_login: string | null;
specimen_inat_genus: string | null;
specimen_inat_family: string | null;

// In OCCURRENCE_COLUMNS (extend the existing array):
'specimen_inat_login', 'specimen_inat_genus', 'specimen_inat_family',
```

---

### WR-03: `groupBySpecimenSample` uses non-null assertions on fields that can be null on provisional rows

**File:** `frontend/src/bee-occurrence-detail.ts:17-30`

**Issue:** `groupBySpecimenSample` is only called with `specimenBacked` rows (those where `ecdysis_id != null`), so in practice it will never receive a provisional row. However the function itself does not enforce this — it accepts `OccurrenceRow[]` and uses non-null assertions (`row.year!`, `row.month!`, `row.recordedBy!`, `row.fieldNumber!`) without validation. If a row with null `recordedBy` or `fieldNumber` is passed (as is valid for ARM 1 ecdysis rows that haven't been linked to a sample), the resulting `SampleGroup` will have `recordedBy: null` rendered as "null" in the template at line 189.

More concretely, the ARM 1 rows in `export.py` have `recordedBy` and `fieldNumber` from `ecdysis_base`, which can be null if the Ecdysis record has empty fields. The key at line 17 (`${row.recordedBy}-${row.fieldNumber}`) will group nulls together as `"null-null"`, and the header renders `recordedBy · fieldNumber` as the literal string "null · null".

**Fix:** Defend the group key and rendered values against null:
```typescript
// Line 17: use empty-string fallbacks in the key
const key = `${row.year ?? ''}-${row.month ?? ''}-${row.recordedBy ?? ''}-${row.fieldNumber ?? ''}`;

// Lines 21-24: use fallbacks rather than non-null assertions
map.set(key, {
  year: row.year ?? 0,
  month: row.month ?? 0,
  recordedBy: row.recordedBy ?? '',
  fieldNumber: row.fieldNumber ?? '',
  elevation_m: row.elevation_m,
  rows: [],
});
```
Then in `_renderSpecimenGroup`, render a fallback for empty `recordedBy`/`fieldNumber` if needed (e.g. an em dash or omit the segment).

---

## Info

### IN-01: `buildFilterSQL` collector filter silently emits an empty clause when all collectors lack both `recordedBy` and `host_inat_login`

**File:** `frontend/src/filter.ts:232-243`

**Issue:** If `selectedCollectors` is non-empty but every entry has both `recordedBy: null` and `host_inat_login: null`, `parts` will be empty and no clause is added. The filter appears active (`isFilterActive` returns true) but generates no SQL restriction, returning all rows. This is an unlikely state (a `CollectorEntry` with both nulls is semantically invalid) but the code does not document or assert this invariant.

**Fix:** Either document the invariant as a comment, or add a guard:
```typescript
// Defensive: if no parts resolved (both fields null for all collectors), skip clause entirely.
// A CollectorEntry with both fields null is a degenerate state that should not occur.
if (parts.length > 0) occurrenceClauses.push(`(${parts.join(' OR ')})`);
// else: already has this guard — the fix is to add the comment above it.
```

---

### IN-02: `validate-schema.mjs` swallows `ENOENT` only for local mode, but the local-vs-CloudFront branch is determined before the loop

**File:** `scripts/validate-schema.mjs:59-60`

**Issue:** The `ENOENT` catch branch at line 59 is only reached in local mode (when `useLocal` is true and the file is missing). But if `useLocal` is true, the file existence was already confirmed by `existsSync` at line 43 before the loop. In practice this catch can only fire if the file is deleted between the `existsSync` check and the `asyncBufferFromFile` call (a race that is essentially impossible in CI). The dead branch is harmless but slightly misleading — `ENOENT` in CloudFront mode will fall through to the generic error branch, which is correct.

**Fix:** Either remove the `ENOENT` special-case (the generic branch handles it correctly), or add a comment:
```javascript
} catch (e) {
  // ENOENT only possible in local mode (existsSync race); generic branch handles CloudFront 403/404.
  if (useLocal && e.code === 'ENOENT') {
```

---

_Reviewed: 2026-04-20_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

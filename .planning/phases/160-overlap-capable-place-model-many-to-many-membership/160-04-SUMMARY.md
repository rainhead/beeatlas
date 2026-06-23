---
phase: 160-overlap-capable-place-model-many-to-many-membership
plan: 04
subsystem: frontend (place filter + occurrence-detail UI)
tags: [places, membership, many-to-many, filter, wa-sqlite, lit, state-ownership, D-04]
requires:
  - "occurrence_places (occ_id, place_slug) table inside occurrences.db (160-02)"
  - "src/occurrence.ts occIdFromRow priority (occ_id CASE coupling)"
  - "places_meta JSON (slug→name source, resolveDataUrl)"
provides:
  - "src/filter.ts EXISTS-membership place clause against occurrence_places"
  - "src/filter.ts getOccurrencePlaceSlugs(occId) — D-04 membership helper (sorted, deduped)"
  - "place_slug removed from OccurrenceRow + OCCURRENCE_COLUMNS (frontend row contract)"
  - "D-04: bee-occurrence-detail lists ALL member place names per occurrence"
  - "state-owner-resolved Map<occId, string[]> threaded bee-atlas → bee-pane → detail"
affects: []
tech-stack:
  added: []
  patterns:
    - "EXISTS membership subquery with inline occ_id SQL CASE (OCC_ID_SQL_CASE const) mirroring occIdFromRow"
    - "Membership fetch in the state owner (<bee-atlas>); resolved names passed DOWN as a property (CLAUDE.md state-ownership invariant)"
    - "Single-quote escaping retained on the user-influenced place slug (T-160-01)"
key-files:
  created: []
  modified:
    - src/filter.ts
    - src/bee-atlas.ts
    - src/bee-pane.ts
    - src/bee-occurrence-detail.ts
    - src/tests/filter.test.ts
    - src/tests/occurrence.test.ts
    - src/tests/bee-occurrence-detail.test.ts
decisions:
  - "D-04 name-resolution design: bee-atlas owns BOTH the membership query AND its own slug→name map (Option B). It fetches places_meta into a private _placeNameBySlug, runs getOccurrencePlaceSlugs per displayed occId, and builds Map<occId, string[]> of names passed down. bee-pane's existing _placeNameBySlug (used for the place chip + picker options) is left untouched — not lifted — because it also drives _placeOptions; duplicating a tiny read-only static-JSON map in the owner is cheaper than refactoring the picker."
  - "occ_id reconstruction extracted to a module constant OCC_ID_SQL_CASE in filter.ts, documented as positionally coupled to occurrence.ts occIdFromRow + occurrence_places.sql (change all three together)"
  - "getOccurrencePlaceSlugs interpolates+escapes occ_id rather than binding (the module's sqlite3.exec path has no ? binding); occ_id is machine-derived so escaping is defense-in-depth"
metrics:
  duration: ~8m
  completed: 2026-06-23
---

# Phase 160 Plan 04: Wave 3 frontend — membership place filter + D-04 member-place list Summary

Rewrote the place filter from a scalar `place_slug = ?` equality to an `EXISTS` membership test against the in-`occurrences.db` `occurrence_places` bridge, removed `place_slug` from the frontend occurrence-row contract, and shipped D-04: the sidebar occurrence detail now lists ALL the places an occurrence belongs to. The membership query originates in the state owner (`<bee-atlas>`) and resolved names flow down as a property, honoring the CLAUDE.md state-ownership invariant. This turns the 160-01 filter EXISTS/no-place_slug/escape assertions GREEN and adds the D-04 render test.

## What Was Built

**Task 1 — membership filter + drop place_slug (commit `ec2a6240`):**
- Replaced the place WHERE clause with `EXISTS (SELECT 1 FROM occurrence_places op WHERE op.place_slug = '<escaped>' AND op.occ_id = <CASE>)`. The slug retains its `'`→`''` escaping (T-160-01). The `occ_id` CASE is a new module constant `OCC_ID_SQL_CASE` (ecdysis → inat → inat_obs → checklist) mirroring `occurrence.ts:23-30` verbatim, documented as positionally coupled to both `occurrence.ts` and `occurrence_places.sql`.
- Removed `place_slug: string | null` from `OccurrenceRow` and `'place_slug'` from `OCCURRENCE_COLUMNS` — no longer a mart column after 160-02. The five `OCCURRENCE_COLUMNS.map(c => 'o.'+c)` SELECT builders still produce valid SQL.
- Added `getOccurrencePlaceSlugs(occId): Promise<string[]>` — `SELECT place_slug FROM occurrence_places WHERE occ_id = ? ORDER BY place_slug`, returning sorted, de-duplicated slugs.

**Task 2 — D-04 member-place list (commit `c73cc585`):**
- `bee-atlas.ts` (state owner): added `_placeNamesByOccId: Map<string, string[]>` (@state) and a private `_placeNameBySlug` map. After `_listRows` is populated, `_resolvePlaceNames(rows)` runs `getOccurrencePlaceSlugs` for each displayed occId (the wa-sqlite call lives HERE) and maps slugs → display names from `places_meta` (`_ensurePlaceNameBySlug`), building a sorted/deduped `Map<occId, string[]>`.
- Threaded `.placeNames=${this._placeNamesByOccId}` into the `<bee-pane>` binding; `bee-pane` forwards it as a `placeNames` property to `<bee-occurrence-detail>`.
- `bee-occurrence-detail.ts`: added a `placeNames` property and `_renderPlaceNames(row)` (keyed via `occIdFromRow(row)`) rendering a `.member-place` chip list, injected into all five per-row renderers (collector-group `<li>`, sample-only, provisional, inat-obs, checklist). Renders nothing when membership is empty (no sentinel). Added `.member-places`/`.member-place` styles.
- Added D-04 render tests mounting the component: multi-place lists all names, no-place renders none, single-place lists one; plus a source-grep assertion that the presenter never calls `getOccurrencePlaceSlugs`/`getDB`/`sqlite3.exec`/`tablesReady`.

## Verification Results

- `npm test -- filter` → 72 passed (the three 160-01 RED assertions — EXISTS membership, place_slug absent, quote-escape — now GREEN).
- `npm test -- bee-occurrence-detail` → 19 passed (4 new D-04 cases + the pre-existing structure/formatRomanDate cases).
- `npm test` (full suite) → 843 passed, 32 files. (One test logs a swallowed `ECONNREFUSED 127.0.0.1:3000` from a fetch it tolerates — all assertions pass.)
- `npm run build` (tsc --noEmit → eleventy + Vite) → clean; bundle-size gate ok (0.7 KB / 100 KB).
- `grep getOccurrencePlaceSlugs` → call sites only in `filter.ts` (definition) and `bee-atlas.ts` (state owner). `grep getDB|sqlite3.exec|tablesReady|getOccurrencePlaceSlugs src/bee-pane.ts src/bee-occurrence-detail.ts` → none (presenters are pure).

## Deviations from Plan

**1. [Rule 1 - Bug] Impossible RED assertion in filter.test.ts**
- **Found during:** Task 1.
- **Issue:** The 160-01 test asserted both `toContain("op.place_slug = 'ebeys-landing'")` AND `not.toContain("place_slug = 'ebeys-landing'")`. Because `op.place_slug = 'ebeys-landing'` contains `place_slug = 'ebeys-landing'` as a substring, the two are mathematically contradictory — no implementation could satisfy both.
- **Fix:** Changed the exclusion to `not.toContain("o.place_slug =")` — the actual intent ("no bare scalar `o.place_slug` equality on the occurrences row"), which the new `op.`-qualified bridge clause satisfies.
- **Files modified:** src/tests/filter.test.ts
- **Commit:** ec2a6240

**2. [Rule 3 - Blocking] place_slug in occurrence.test.ts BASE_ROW fixture**
- **Found during:** Task 1 typecheck.
- **Issue:** `tsc` failed — `occurrence.test.ts` BASE_ROW literal specified `place_slug: null`, which no longer exists on `OccurrenceRow`.
- **Fix:** Removed the `place_slug: null` line from the fixture.
- **Files modified:** src/tests/occurrence.test.ts
- **Commit:** ec2a6240

## Deferred Items

The Python `test_sqlite_export.py` failures noted in `deferred-items.md` (from 160-03) are NOT addressed here — they live in the Python sqlite arm (owned by 160-02), and 160-04 is frontend-only (`src/*.ts`). Left deferred per its own note.

## Threat Flags

None. T-160-01 (SQLi via place slug) is mitigated: the EXISTS clause retains `f.selectedPlace.replace(/'/g, "''")` escaping (asserted by `filter.test.ts` `op.place_slug = 'o''brien-ranch'`). `getOccurrencePlaceSlugs` escapes the machine-derived occ_id (defense-in-depth). No new packages installed (T-160-SC N/A). No new network/auth/file surface.

## Self-Check: PASSED

- FOUND: src/filter.ts (EXISTS clause + getOccurrencePlaceSlugs; place_slug dropped from row/columns)
- FOUND: src/bee-atlas.ts (state-owner membership resolution + placeNames binding)
- FOUND: src/bee-pane.ts (placeNames pass-through)
- FOUND: src/bee-occurrence-detail.ts (placeNames property + _renderPlaceNames)
- FOUND: src/tests/filter.test.ts, src/tests/occurrence.test.ts, src/tests/bee-occurrence-detail.test.ts (modified)
- FOUND commit: ec2a6240 (Task 1)
- FOUND commit: c73cc585 (Task 2)

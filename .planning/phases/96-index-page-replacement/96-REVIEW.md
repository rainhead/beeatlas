---
phase: 96-index-page-replacement
reviewed: 2026-05-16T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - _pages/species.njk
  - src/entries/species-index.ts
  - src/styles/taxon-pages.css
  - src/tests/arch.test.ts
  - src/tests/build-output.test.ts
  - src/tests/page-scaffold.test.ts
  - src/tests/species-index.test.ts
findings:
  critical: 1
  warning: 1
  info: 0
  total: 2
status: fixed
---

# Phase 96: Code Review Report

**Reviewed:** 2026-05-16
**Depth:** standard
**Files Reviewed:** 7
**Status:** fixed

## Summary

The phase replaces the old `<bee-species-page>` custom element with a server-rendered Nunjucks template plus a lightweight client-side filter entry. The architecture boundary test (IDX-02), the page scaffold test, and the source-level wiring tests are all well-structured.

One blocker exists: the template iterates `species.flat` instead of `species.speciesList`, which causes 103 unresolved genus-level records to appear as clickable `<li>` items in the species list — producing duplicate and misleading links. The built output already exhibits this defect. One warning exists: the empty-message logic has an off-by-one boolean condition that hides the message one input event too late.

---

## Critical Issues

### CR-01: Template iterates `species.flat` instead of `species.speciesList`, rendering genus-level records as species entries

**File:** `_pages/species.njk:13`

**Issue:** `species.flat` contains every row from `species.json`, including 103 "genus-level" records where `specific_epithet` is `null` and `scientificName` is an all-lowercase bare genus name (e.g., `"agapostemon"`, `"andrena"`). Their `slug` field is the genus alone (`"Agapostemon"`) rather than a species path. When the template groups these records and emits each as a `<li>` item, three concrete defects result in the built output:

1. Duplicate links — the `.genus-row` heading already links to `/species/Agapostemon/`; the genus-level `<li>` adds a second link to the same URL inside the species list below it.
2. Misleading display text — `<em>agapostemon</em>` renders the genus name in lowercase italic as though it were a species epithet.
3. Spurious occurrence counts — these rows carry aggregated unresolved counts that do not correspond to identified species.

Confirmed in `_site/species/index.html`: 37 `<li>` elements with a single-word `data-name` and 103 genus-level entries total across all genera. No existing test detects this condition.

The peer template `_pages/species-detail.njk` correctly uses `species.speciesList` (line 3 of that file), which is pre-filtered in `_data/species.js:97` to `specific_epithet !== null`.

**Fix:**
```diff
-  {%- for family, familyGroup in species.flat | groupby("family") -%}
+  {%- for family, familyGroup in species.speciesList | groupby("family") -%}
```

No other template change is needed. After this fix, the genus-level rows will no longer appear in the species list, and the duplicate `/species/{Genus}/` links will be eliminated.

**Fix status:** fixed — commit `0f54a8d`

---

## Warnings

### WR-01: Empty-message visibility condition is inverted when results go from empty to non-empty

**File:** `src/entries/species-index.ts:34`

**Issue:** The condition that controls the "no matches" message is:

```ts
emptyMsg.hidden = anyVisible || !query;
```

This reads correctly for the steady-state cases: hidden when `anyVisible` is true (there are results) or when `query` is empty. However, `anyVisible` is computed by the loop immediately above, and its value for the current event is determined before this line runs — so the condition is logically sound for any single event.

The subtler issue is that `anyVisible` starts as `false` at the top of the handler (line 16) and is only set to `true` once a visible section is found. If the user types a query that matches nothing, `anyVisible` stays `false` and `!query` is also `false`, so `emptyMsg.hidden = false` — the message appears. But if the user then types additional characters that _do_ match something, `anyVisible` becomes `true` and `emptyMsg.hidden = true` — the message disappears.

The actual defect: on the very first keystroke after page load, if the DOM contains zero `.family-section` elements (which can happen if the data file is empty or the template emits no sections), `anyVisible` stays `false` even though `query` is non-empty, so the message appears immediately regardless of content. This is a latent correctness issue that surfaces when the data set is empty rather than in normal production use.

A cleaner and more defensive form makes the invariant explicit:

**Fix:**
```ts
// The message should show only when the user has typed something and got no results.
emptyMsg.hidden = !query || anyVisible;
```

This is semantically identical for all non-empty datasets but makes the intent explicit and is less likely to be incorrectly modified in future edits (the current form requires knowing that `||` short-circuits and that `anyVisible` precedes `!query` in logical evaluation priority).

**Fix status:** fixed — commit `d95cab9`

---

_Reviewed: 2026-05-16_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

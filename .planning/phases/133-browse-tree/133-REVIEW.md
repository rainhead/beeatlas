---
phase: 133-browse-tree
reviewed: 2026-06-03T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - _data/species.js
  - _pages/species.njk
  - src/entries/species-index.ts
  - src/styles/taxon-pages.css
  - src/tests/data-species.test.ts
  - src/tests/species-index.test.ts
findings:
  critical: 3
  warning: 5
  info: 3
  total: 11
status: issues_found
---

# Phase 133: Code Review Report

**Reviewed:** 2026-06-03
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Phase 133 builds a build-time bee-only taxonomy tree (`_data/species.js` → `fullTree`), a recursive Nunjucks `<details>` tree (`_pages/species.njk`), CSS, and client behavior (rank toggle + localStorage + type-to-filter + ancestor auto-expand).

The security-relevant surfaces called out in the task are **clean**: the empty-state query echo uses `textContent` (no XSS — T-133-07), localStorage reads use strict `=== '1'` inside `try/catch` (T-133-08/09), and the template carries no `| safe`. Eleventy autoescaping handles HTML-context output.

However, the interactive layer has **three blocking correctness defects** that break the feature in its default state. The root cause is a single architectural mistake: intermediate ranks are hidden by placing the native `hidden` attribute on the wrapping `<details>` element, but a hidden DOM node hides its **entire subtree**. Because **all six bee families have subfamily rows** (verified against `public/data/higher_taxa.json`), every genus and species in the tree is nested inside a `hidden` subfamily by default — so the default view renders six family rows with **nothing visible beneath any of them**, directly contradicting the D-03 "family → genus → species default depth" contract. The filter and ancestor-expand logic compound this: `openAncestors` sets `.open` but never clears `.hidden`, and a hidden `<details open>` is still `display:none`.

These runtime bugs are not caught by the test suite because `src/tests/species-index.test.ts` is source-grep-only (no jsdom/DOM execution) — it asserts that certain strings appear in the source, not that the behavior is correct.

The `fullTree` data builder in `_data/species.js` is sound and well-tested.

## Critical Issues

### CR-01: Default view hides all genera and species — intermediate ranks hide their entire subtree

**File:** `_pages/species.njk:44,63,74` (and `src/entries/species-index.ts:37-44`)
**Issue:** Subfamily, tribe, and subgenus `<details>` are rendered with the native `hidden` attribute, and `applyRankToggle` toggles that attribute. But genus and species nodes are DOM **descendants** of those `<details>` (subfamily → tribe → genus → species). The `hidden` attribute resolves to UA `[hidden] { display: none }`, which hides the element and its whole subtree. Verified: all six families (Apidae, Andrenidae, Halictidae, Megachilidae, Colletidae, Melittidae) have subfamily rows in `higher_taxa.json`, and e.g. `Bombus` is nested under subfamily `Apinae` / tribe `Bombini`. With the toggle OFF (default), every genus/species sits inside a hidden subfamily, so the default page shows only six family names with no expandable content beneath — the opposite of the D-03 "default depth = family → genus → species" requirement (133-CONTEXT.md D-03; 133-01-PLAN.md:14,116).

You cannot skip an intermediate rank by hiding its wrapper element while keeping its children visible — hiding the wrapper hides the children. The "skip intermediate ranks" view requires either (a) flattening the markup so genera are not DOM-nested inside subfamily/tribe elements, or (b) a CSS approach that only collapses the intermediate node's own `<summary>` chrome while re-parenting its children, or (c) `display: contents` on the hidden intermediate so its children still render.

**Fix:** Replace the subtree-hiding `hidden` attribute with a mechanism that hides only the intermediate node's own row while keeping descendants in flow. One option:
```css
/* Hide only the intermediate node's summary; let its children render in place */
.species-index details.tree-node--intermediate[data-collapsed] > summary { display: none; }
.species-index details.tree-node--intermediate[data-collapsed] { display: contents; }
```
and have `applyRankToggle` set/remove `data-collapsed` instead of `el.hidden`. Alternatively, restructure `fullTree`/template so the default depth chain (family → genus → species) is not DOM-nested under subfamily/tribe wrappers. Add a jsdom test that asserts a known genus (`Bombus`) is visible (offsetParent or computed display) in the default view.

### CR-02: Filter never reveals a deep match — matched node's ancestors stay hidden

**File:** `src/entries/species-index.ts:59-65,87-103`
**Issue:** `runFilter` iterates `[data-rank]` nodes in document order. When a node does not match, it is set `node.hidden = true`. Ancestors appear **before** their descendants in document order, so a family/genus whose name does not contain the query is hidden first. When a descendant species later matches, `openAncestors(node)` sets `parent.open = true` but never clears `parent.hidden`. A hidden `<details open>` is still `display: none`, so the matched node is inside a hidden ancestor and remains invisible. Result: filtering for a species name whose ancestors don't share the substring (the normal case) shows nothing and triggers the "No taxa match" empty state even though a node matched (`anyVisible` is true, but the user sees nothing). This breaks the core filter feature.

**Fix:** `openAncestors` must also un-hide ancestors:
```ts
function openAncestors(el: HTMLElement): void {
  let parent = el.parentElement;
  while (parent) {
    if (parent instanceof HTMLDetailsElement) {
      parent.open = true;
      parent.hidden = false;   // ancestor of a match must be visible
    }
    parent = parent.parentElement;
  }
}
```
Note this still interacts with CR-01 — once intermediate hiding no longer hides subtrees, ancestors must be reveal-able. Add a jsdom test: type a species substring, assert the matched `<li>` and its ancestor `<details>` are visible.

### CR-03: Clearing the filter does not restore family/genus/species visibility

**File:** `src/entries/species-index.ts:75-80,37-44`
**Issue:** During filtering, non-matching family, genus, and species nodes are set `node.hidden = true` (line 101). When the query is cleared (empty branch, line 77), the code calls `applyRankToggle(...)`, which only iterates `[data-rank="subfamily"],[data-rank="tribe"],[data-rank="subgenus"]` (line 38-40). It never touches family/genus/species nodes. So every family/genus/species node hidden by a prior non-matching filter pass stays `hidden = true` permanently after the search box is emptied — the tree does not reset. The user must reload the page to recover.

**Fix:** On empty query, explicitly clear `hidden` on all leaf/branch ranks the filter may have hidden, then re-apply the toggle for intermediates:
```ts
if (!query) {
  for (const node of document.querySelectorAll<HTMLElement>(
    '[data-rank="family"],[data-rank="genus"],[data-rank="species"]'
  )) {
    node.hidden = false;
  }
  applyRankToggle(rankToggle ? rankToggle.checked : loadToggleState());
  if (emptyMsg) emptyMsg.hidden = true;
  return;
}
```
A cleaner design is to track filter visibility with a dedicated attribute/class (e.g. `data-filtered-out`) distinct from the toggle's `hidden`, so the two concerns never alias (see WR-01). Add a jsdom test: filter, clear, assert all nodes visible again.

## Warnings

### WR-01: Filter conflates two meanings of `hidden` (toggle-hidden vs filter-hidden)

**File:** `src/entries/species-index.ts:89-92,100-102`
**Issue:** Line 89 treats any `hidden` intermediate node as "hidden by the rank toggle — skip matching." But line 101 also sets intermediates `hidden = true` for being a filter non-match. On the next keystroke, the code cannot distinguish toggle-hidden from filter-hidden, so once an intermediate node is filtered out it is skipped by every subsequent (broader) query and never re-shown — even if "Show all ranks" is ON. The single `hidden` flag is overloaded for two orthogonal concerns.

**Fix:** Use separate state: keep the toggle on `hidden`, and track filter matches with a class (e.g. `.filter-hidden`) or a `data-filter-match` attribute. The match loop then reads "is this node toggle-visible?" independently of prior filter passes. This also simplifies CR-02/CR-03.

### WR-02: Path-segment taxon names are not URL-encoded (only the `?taxon=` query param is)

**File:** `_pages/species.njk:27,46,65,76` (and `:9`)
**Issue:** The `?taxon=` query params use `| urlencode`, but the page-link **path segments** do not:
`href="/species/{{ node.name }}/"` (genus), `href="/species/{{ node.genusName }}/{{ node.name }}/"` (subgenus), `href="/species/tribe/{{ node.name }}/"`, `href="/species/subfamily/{{ node.name }}/"`, and `href="/species/{{ node.slug }}/"` (species). Today the data is clean — all `higher_taxa.json` names match `[A-Za-z-]+` and no `scientificName` contains quotes/angle brackets — so this is not an active break. But it is a latent correctness/robustness bug: a future taxon name with a space, apostrophe (e.g. some authorities), or other reserved character would emit a malformed/incorrect path that won't match the generated page route, while the `?taxon=` link for the same node would be correct. The inconsistency (encode in one place, not the other) is itself a smell.

**Fix:** Apply `| urlencode` to path segments too (matching the route generation in Phase 132/Plan 02), e.g. `href="/species/{{ node.name | urlencode }}/"`. Confirm the page builder (`_pages` genus/subgenus/tribe/subfamily routes) uses the same encoding so the paths line up. Note Eleventy autoescaping still HTML-escapes the attribute value, so this is about URL-correctness, not XSS.

### WR-03: Runtime behavior is untested — species-index tests are source-grep only

**File:** `src/tests/species-index.test.ts:107-172`
**Issue:** Every test in the `species-index.ts` describe block asserts that specific strings (`'.textContent'`, `"=== '1'"`, `'[data-rank'`, `'.open = true'`) appear in the **source text**. None execute the code against a DOM. As a result, CR-01/CR-02/CR-03 — the filter not revealing matches, the toggle hiding entire subtrees, the tree not resetting on clear — all pass the suite while the feature is broken. The test for `'.open = true'` (line 138) "verifies" auto-expand by grepping for the literal, which is exactly the line that doesn't actually make matches visible.

**Fix:** Add jsdom-based behavioral tests that load the rendered tree fragment and exercise `runFilter`/`applyRankToggle`: (1) default view shows a known genus; (2) typing a species substring makes that species visible and its ancestors visible/open; (3) clearing the filter restores all nodes; (4) toggling "Show all ranks" reveals intermediate nodes and their descendants stay visible.

### WR-04: `runFilter` reads `rankToggle.checked` / `loadToggleState()` redundantly and re-reads localStorage per keystroke

**File:** `src/entries/species-index.ts:77`
**Issue:** On every empty-query pass, `applyRankToggle(rankToggle ? rankToggle.checked : loadToggleState())` may call `loadToggleState()`, hitting `localStorage.getItem` inside try/catch. When `rankToggle` exists (the normal case) it reads `.checked`, which is fine; but the fallback path re-reads storage on each input event. More importantly, `applyRankToggle` already sets `rankToggle.checked = showAll` (line 43), so the source of truth is ambiguous between the checkbox and storage. Minor, but it makes the visibility state harder to reason about and feeds the CR-03 confusion.

**Fix:** Compute the desired toggle state once (prefer the checkbox when present) and pass it; avoid `loadToggleState()` in the hot filter path.

### WR-05: Empty-state query echo updates even when results are visible

**File:** `src/entries/species-index.ts:106-110`
**Issue:** The block sets `querySpan.textContent = rawQuery` unconditionally on every filter run, including when `anyVisible` is true (message hidden). Functionally harmless (the `<span>` is inside a `hidden` `<p>`), but it does DOM work for a paragraph that isn't shown and slightly muddies intent. Low severity; flagged for tidiness given the empty-state is a called-out surface.

**Fix:** Only set the echo text when the empty state is shown:
```ts
if (emptyMsg) {
  emptyMsg.hidden = anyVisible;
  if (!anyVisible) {
    const querySpan = document.getElementById('filter-query');
    if (querySpan) querySpan.textContent = rawQuery;
  }
}
```

## Info

### IN-01: Legacy `tree` / `buildTree` export retained but unused by this phase

**File:** `_data/species.js:56-83,564`
**Issue:** `TAXON_LEVELS`, `buildTree`, `toPlain`, and the exported `tree` build a `'null'`-string-keyed nested object that Phase 133 does not consume (the new structure is `fullTree`). The header comment (lines 7-8) still describes `tree` as a "placeholder shape -- Phase 81 (NAV-01) will harden." Dead-weight for this phase; verify no remaining consumer before removal.
**Fix:** If nothing reads `species.tree`, remove `buildTree`/`toPlain`/`TAXON_LEVELS`/`tree` and the export entry; otherwise update the stale comment.

### IN-02: Redundant double-lowercasing in filter match

**File:** `src/entries/species-index.ts:93`
**Issue:** `data-name` is already lowercased by the template (`{{ node.name | lower }}` / `{{ node.scientificName | lower }}`), and `runFilter` lowercases it again: `(node.dataset.name ?? '').toLowerCase()`. The comment on line 86 even states the value is "always lowercased in HTML by the template." Harmless, but the extra `.toLowerCase()` is dead work and contradicts the stated invariant.
**Fix:** Drop the trailing `.toLowerCase()` (or drop `| lower` from the template and lowercase only in JS — pick one source of truth).

### IN-03: Family count `|| ` fallback can mask a legitimate zero

**File:** `_data/species.js:543-548`
**Issue:** `sfRows.reduce(...) || allGenusRows.filter(...).reduce(...)` uses `||` so a legitimate summed count of `0` from subfamily rows falls through to the genus-based sum. For the current data both branches yield `0` when truly zero, so no observable bug, but `||` on a numeric total is a latent foot-gun if a family ever has subfamily rows whose counts genuinely sum to 0.
**Fix:** Use an explicit presence check (`sfRows.length > 0 ? sfRows.reduce(...) : allGenusRows...`) rather than truthiness of the numeric result.

---

_Reviewed: 2026-06-03_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

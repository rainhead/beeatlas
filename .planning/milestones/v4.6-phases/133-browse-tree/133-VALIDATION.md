---
phase: 133
slug: browse-tree
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-03
---

# Phase 133 — Validation Strategy

> Per-phase validation contract. Reconstructed from artifacts after execution
> (State B), reflecting the gap-closure work that replaced the original
> source-grep behavioral tests with real DOM-executing tests.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest + happy-dom (frontend); pytest via `uv run` (data — not exercised this phase) |
| **Config file** | `vite.config.ts` (`environment: 'happy-dom'`); `package.json` `test` script |
| **Quick run command** | `VITEST_SKIP_BUILD=1 npx vitest run src/tests/data-species.test.ts src/tests/species-index.test.ts` |
| **Full suite command** | `VITEST_SKIP_BUILD=1 npx vitest run && npm run build` |
| **Estimated runtime** | ~2 s targeted; ~17 s full suite + build |

---

## Sampling Rate

- **After every task commit:** `VITEST_SKIP_BUILD=1 npx vitest run src/tests/species-index.test.ts`
- **After every plan wave:** `VITEST_SKIP_BUILD=1 npx vitest run && npm run build`
- **Before completion:** Full suite green + `npm run build` (tsc clean) + human-verify of CSS rendering
- **Max feedback latency:** ~20 seconds

---

## Per-Task Verification Map

| Behavior | Requirement | Plan | Test Type | Automated Command | Status |
|----------|-------------|------|-----------|-------------------|--------|
| `fullTree` is a non-empty six-rank bee-only nested tree (family→…→species); every subgenus carries `genusName` | TREE-01 | 133-01 | unit | `…vitest run src/tests/data-species.test.ts` | ✅ green |
| Per-node `specimen_count`/`inat_obs_count` present and descendant-rolled (Bombus genus = sum of species) | TREE-02 | 133-01 | unit | `…vitest run src/tests/data-species.test.ts` | ✅ green |
| Bee-only sourcing — no bycatch node (e.g. no Eumeninae) in `fullTree` | TREE-04 | 133-01 | unit | `…vitest run src/tests/data-species.test.ts` | ✅ green |
| Template renders recursive `<details>` tree; intermediate ranks ship WITHOUT `hidden` (no-JS shows all ranks) | TREE-01 | 133-02 | source | `…vitest run src/tests/species-index.test.ts` | ✅ green |
| Node markup: `node-counts` middle-dot split, `node-map` `?…&taxonRank=` links, family plain text, subgenus uses `genusName` (no `/species/undefined/`) | TREE-02/04 | 133-02 | source | `…vitest run src/tests/species-index.test.ts` | ✅ green |
| Default OFF skips subfamily/tribe/subgenus via `rank-skipped` class + forced-open (NOT `hidden`); genera/species stay visible | TREE-01 | 133-04 (gap) | DOM (happy-dom) | `…vitest run src/tests/species-index.test.ts` | ✅ green |
| Toggle ON reveals intermediate ranks; localStorage round-trip (`'1'`/`'0'`, strict, try/catch) | TREE-01 | 133-04 | DOM (happy-dom) | `…vitest run src/tests/species-index.test.ts` | ✅ green |
| Filter narrows to matches, hides non-matches; `[data-rank][hidden]` actually hides (specificity beats `display:flex`) | TREE-03 | 133-04 (gap) | DOM (happy-dom) | `…vitest run src/tests/species-index.test.ts` | ✅ green |
| Match auto-expands ancestors: `openAncestors` un-hides AND opens every ancestor `<details>`; filter reset restores all ranks | TREE-03 | 133-04 (gap) | DOM (happy-dom) | `…vitest run src/tests/species-index.test.ts` | ✅ green |
| Empty-state query echoed via `textContent` only — `<img onerror>` payload not parsed (T-133-07 XSS) | TREE-03 | 133-04 | DOM (happy-dom) | `…vitest run src/tests/species-index.test.ts` | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

Targeted suite: **77/77 green** (2026-06-03).

---

## Manual-Only (no automated coverage — by nature)

happy-dom has no layout/CSS engine, so the following are confirmed by human-verify
(recorded in `133-04-SUMMARY.md` §Gap Closure, approved 2026-06-03), not automated:

| Behavior | Why manual | Verification |
|----------|-----------|--------------|
| `display:contents` rank-skip actually promotes genera/species under the family in a real browser | No CSS layout in happy-dom | Human-verify ✓ |
| Disclosure triangle (▸/▾) is visible and legible; toggle does not reflow the page | Visual / rendered styles | Human-verify ✓ |
| Species nest (indent) under their genus; keyboard focus rings visible | Visual / rendered styles | Human-verify ✓ |

---

## Wave 0 Requirements — COMPLETE

Each behavior-bearing plan led with RED tests: 133-01 (`RED fullTree contract`,
commit a8a566c), 133-02 (`RED markup assertions`, 779d0a3), 133-04 (`RED source
assertions`, 2ce52f7). The gap-closure cycle later replaced the 133-04 source-grep
behavioral assertions with executable happy-dom tests (commit af750e8) after code
review found they passed while the feature was broken — closing the WR-03 finding.

## Validation Audit 2026-06-03

| Metric | Count |
|--------|-------|
| Requirements | 4 (TREE-01..04) |
| COVERED (automated) | 4 |
| MISSING / PARTIAL | 0 |
| Manual-only (CSS rendering) | 3 behaviors |

Phase 133 is **Nyquist-compliant**: every requirement has automated verification;
the only manual items are inherently un-automatable CSS-rendering checks, human-verified.

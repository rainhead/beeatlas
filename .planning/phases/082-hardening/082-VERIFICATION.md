---
phase: 082-hardening
verified: 2026-05-05T21:30:00Z
status: passed
score: 6/6 must-haves verified
overrides_applied: 0
---

# Phase 82: Hardening Verification Report

**Phase Goal:** The species page meets its performance, accessibility, and durability budgets and survives a UAT pass against the seed's stated use cases.
**Verified:** 2026-05-05T21:30Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Per-Requirement Verification

| Req | Claim | Evidence | Status |
|-----|-------|----------|--------|
| PERF-01 | CI fails build when species chunk > 100 KB gzipped | `scripts/validate-bundle-size.mjs` exists with `BUDGET_BYTES = 100 * 1024`; wired into `npm run build` chain in `package.json:25`; live run prints `ok index-B5DsVfuS.js: 5.4 KB / 100.0 KB (94.6 KB headroom)` | PASS |
| PERF-02 | LCP < 3 s, re-runnable command documented | `scripts/measure-lcp.sh` exists (post-fix `a450504` for Lighthouse-13 flag conflict + macOS mktemp suffix); `npm run measure-lcp` alias in package.json:28; `data/README.md:93` "Performance" section documents invocation; UAT recorded LCP = 1421 ms post photo-fix (47% headroom) | PASS |
| PERF-03 | Photos lazy + alt + medium hero + srcset | `_data/photos.js` default-exports manifest (post-fix `86b53d8`); `lib/inat-srcset.js` provides `deriveSrcset` (square 75w / small 240w / medium 500w); `grep -c srcset= _site/species/index.html` → **489**; bee-species-card already emits `loading="lazy"` per CONTEXT | PASS |
| PERF-04 | Weekly cron HEADs photos, writes drift report (informational) | `.github/workflows/photo-availability.yml` present (cron `0 13 * * 1`, concurrency: photo-availability, exits 0); `scripts/check-photo-availability.mjs` present with ≤1 req/sec pacing + 5xx retry; `data/manifest_drift_report.json` first-run-pending (no scheduled run yet — informational only, never blocks deploys per D-10) | PASS |
| PERF-05 | A11y: alt, role/aria, keyboard | `_includes/taxon-tree.njk` emits `role="treeitem"`/`role="group"`/`aria-expanded="false"` at every level (lines 23, 36, 49, 56, 71, 74, 85, 88, 99); `src/species/tests/a11y.test.ts` runs **9/9 passing** (covers nav tree aria, img alt, filter focusability, keyboard expand/collapse) | PASS |
| PERF-06 | UAT against seed use cases passes against current data | `082-UAT.md` records PASS for Use Case 1 (*Eucera* in North Cascades — non-*Eucera* cards muted post-`195232d`) and Use Case 2 (top frequencies match `species.json` ground truth); T2 + T7 carry-ins PASS; PERF-01..05 spot checks all PASS | PASS |

**Score:** 6/6 requirements verified

### Key Artifact Spot-Checks

| Artifact | Check | Result |
|----------|-------|--------|
| `src/styles/species.css` lines 51-53 | `bee-species-page bee-species-card.muted { opacity: 0.35 }` (descendant selector for light-DOM card per `195232d`) | VERIFIED |
| `src/species/seasonality-viz.ts:67-71` | T7/D-08 fix: drops `, ${monthLetter}` suffix when single-month (`monthsWithData.length > 1` gate) | VERIFIED |
| `_data/photos.js` | Default-export only (no named export) — Eleventy auto-unwrap works (post `86b53d8`) | VERIFIED |
| `lib/inat-srcset.js` | Helper module exists | VERIFIED |
| `package.json:25` | Build chain: `validate-schema && validate-species && typecheck && eleventy && validate-bundle-size` | VERIFIED |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Bundle gate runs | `npm run validate-bundle-size` | `ok index-B5DsVfuS.js: 5.4 KB / 100.0 KB (94.6 KB headroom)` | PASS |
| A11y suite passes | `npx vitest run src/species/tests/a11y.test.ts` | 9/9 passing | PASS |
| Built site has srcset | `grep -c 'srcset=' _site/species/index.html` | 489 | PASS |
| Drift report present | `ls data/manifest_drift_report.json` | absent — first-run-pending | INFO (UAT-accepted; informational only) |

### Anti-Patterns Found

None. All five in-flight fixes during pre-UAT (`a450504`, `f23496f`, `86b53d8`, `032a29c`, `195232d`) landed in main and are reflected in source. The `data/manifest_drift_report.json` absence is by design — the workflow is scheduled-only and has not yet run; PERF-04 SC explicitly classifies the report as informational.

### Human Verification Required

None — UAT (082-UAT.md) is the human-verification artifact and records PASS for both seed use cases plus carry-in regressions.

### Gaps Summary

No gaps. All six PERF requirements (PERF-01..06) have on-disk evidence matching the ROADMAP success criteria. The five pre-UAT fixes are committed on main (top commit `2770235`), the build chain is wired, the a11y test suite executes green locally, the species build emits 489 srcset attributes, and the UAT records PASS dispositions across all checks.

---

*Verified: 2026-05-05T21:30Z*
*Verifier: Claude (gsd-verifier)*

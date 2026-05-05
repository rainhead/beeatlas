# Phase 82: Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in 082-CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-04
**Phase:** 082-hardening
**Areas discussed:** Layout strategy (T2), Bundle gate + Lighthouse (PERF-01,02)
**Mode:** advisor (calibration tier: minimal_decisive — vendor philosophy: opinionated)

---

## Layout strategy (T2)

| Option | Description | Selected |
|--------|-------------|----------|
| Fold minimal CSS into 82 | Plain CSS Grid: mobile single-col with `<details>` nav collapse, sticky left rail at ≥768px, no drawer/JS. Tightly scoped to /species/ route. | ✓ |
| Spawn /gsd-ui-phase 82 first | Generate UI-SPEC.md design contract, then implement layout. Adds phase serialization and design-system overhead. | |
| Defer layout entirely | Ship 82 perf/a11y/UAT against unstyled page. LCP measurement won't reflect production look. | |

**User's choice:** Fold minimal CSS into 82.
**Notes:** PERF-02 forces measuring against real layout — shipping 82 against an unstyled page produces meaningless Lighthouse numbers. Skipping the mobile drawer protects PERF-01 bundle budget and PERF-05 keyboard surface. Light-DOM Lit means external CSS works without component changes.

---

## Bundle-size gate (PERF-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Hand-rolled `validate-bundle-size.mjs` | ~30-line script using node:zlib, mirrors validate-schema.mjs/validate-species.mjs. Wired into npm run build after vite step. | ✓ |
| `size-limit` npm package | Battle-tested with PR diff output. Adds 2 deps + package.json config block. | |

**User's choice:** Hand-rolled script.
**Notes:** Aligns with the project's "minimal deps + hand-rolled" stance and the existing pre-/post-build validator pattern. Provides a runtime backstop for ARCH-04's import-boundary test.

---

## Lighthouse runner (PERF-02)

| Option | Description | Selected |
|--------|-------------|----------|
| Local one-shot `scripts/measure-lcp.sh` | Lighthouse CLI against `npm run build` + `npx serve`, mobile preset, asserts LCP <3000ms. Manual pre-release ritual. | ✓ |
| Lighthouse CI in GH Actions | Automated PR comments + history. Adds @lhci/cli, flaky on shared runners (±15% on mobile throttle). | |

**User's choice:** Local one-shot script.
**Notes:** Roadmap SC explicitly says "re-runnable from a documented command". Mobile-throttled LCP measurements in CI are notoriously flaky on shared GH runners and would burn trust. Defer Lighthouse CI until the team has stable preview deploys to point at.

---

## Canary subgenus pinning

| Option | Description | Selected |
|--------|-------------|----------|
| DuckDB query at planning time, pin slug as constant | Query species.parquet for top occurrence_count, hardcode slug in measure-lcp.sh with comment explaining derivation. | ✓ |
| Dynamic at runtime | Script always measures whatever is currently the largest. More resilient to data drift, but each run measures a potentially different page. | |

**User's choice:** Pin slug as constant.
**Notes:** Run-to-run comparability matters more than tracking the *current* worst case. Comment in the script records the query so future maintainers can re-derive after data shifts.

---

## Claude's Discretion

The following items were not surfaced for explicit discussion; sensible defaults were recorded in CONTEXT.md and accepted by the user:

- **T7 month-letter ambiguity** (`'A'` = April or August in seasonality fallback) — drop the trailing `, ${monthLetter}` suffix when `monthsWithData.length === 1` (D-08). Cleanest fix; no parallel month-name system.
- **PHOTO-03 / PERF-03 srcset depth** — generate srcset at template-render time from the iNat URL pattern; no TOML schema change (D-09). Falls back to single-URL `src=` for non-iNat photos.
- **PERF-04 cron failure mode** — report-only; commit `manifest_drift_report.json` if non-empty, exit 0 either way (D-10). No issue creation, no Slack. Concurrency guard, ≤1 req/sec, single retry on 5xx.
- **PERF-05 a11y test approach** — hand-rolled aria/keyboard assertions in vitest, no JSDOM-axe (D-11). Covers nav tree role/aria-expanded, keyboard expand/collapse, photo/map alt text, filter input tab order.
- **PERF-06 UAT format** — mirror `081-UAT.md` structure (numbered tests, expected/result/severity, Summary block) for the two seed use cases. Manual notes acceptable; screenshots optional.
- Vite chunking config — already correct from Phase 80; no change.
- CSS variable / token system for the species layout — none. Use raw values; tokens are design-system work (deferred).

## Deferred Ideas

- Designed visual polish for the species page (typography, spacing tokens, photo carousel, responsive card grid) — needs a design system + `/gsd-ui-phase` pass.
- Lighthouse CI in GH Actions — revisit if mobile-throttle flakiness improves or preview deploys per PR are adopted.
- jest-axe / vitest-axe integration — defer until the page has more interactive surface.
- TOML schema extension to carry all 3 photo sizes explicitly — defer; D-09 zero-cost derivation works.
- Issue auto-creation on photo drift — defer; report-only is the SC default.
- Map page (`/`) Lighthouse budget — separate phase; this hardening pass is species-page-only.

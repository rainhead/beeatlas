---
phase: 79
slug: photo-manifest
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-04
---

# Phase 79 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vite.config.ts` (existing test config) |
| **Quick run command** | `npx vitest run src/tests/validate-species.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds (validator unit tests); ~15s full suite |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run src/tests/validate-species.test.ts`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

> Populated by planner. Each task in PLAN.md must map to a row here with an automated command, or declare a Wave 0 stub dependency, or appear in Manual-Only below.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 79-01-01 | 01 | 1 | PHOTO-01 | — | TOML schema parse exits 0 on valid manifest | unit | `npx vitest run src/tests/validate-species.test.ts -t "valid manifest"` | ❌ W0 | ⬜ pending |
| 79-01-02 | 01 | 1 | PHOTO-02 | — | License whitelist enforced (cc0..cc-by-nc-sa) | unit | `npx vitest run src/tests/validate-species.test.ts -t "license"` | ❌ W0 | ⬜ pending |
| 79-01-03 | 01 | 1 | PHOTO-03 | — | Attribution required for non-CC0 photos | unit | `npx vitest run src/tests/validate-species.test.ts -t "attribution"` | ❌ W0 | ⬜ pending |
| 79-01-04 | 01 | 1 | PHOTO-05 | — | Unknown scientificName warns (exit 0) | unit | `npx vitest run src/tests/validate-species.test.ts -t "unknown species"` | ❌ W0 | ⬜ pending |
| 79-01-05 | 01 | 1 | PHOTO-06 | — | Build chain fails on bad license, recovers on revert | integration | `npm run build` against rigged fixture (subprocess) | ❌ W0 | ⬜ pending |
| 79-02-01 | 02 | 2 | PHOTO-07 | — | Seed rate-limits ≤1 req/sec | unit | `npx vitest run src/tests/seed-species-photos.test.ts -t "rate"` | ❌ W0 | ⬜ pending |
| 79-02-02 | 02 | 2 | PHOTO-08 | — | Seed fill-only: existing tables untouched on re-run | unit | `npx vitest run src/tests/seed-species-photos.test.ts -t "fill-only"` | ❌ W0 | ⬜ pending |
| 79-02-03 | 02 | 2 | PHOTO-04 | — | URL stored verbatim (no render-time construction) | unit | `npx vitest run src/tests/seed-species-photos.test.ts -t "url"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

> Planner SHOULD refine this table — add a row per task in each PLAN.md, link `Threat Ref` to threat IDs from the security threat-model block where applicable, and update `File Exists` once Wave 0 stubs land.

---

## Wave 0 Requirements

- [ ] `src/tests/validate-species.test.ts` — empty `describe` blocks for PHOTO-01, PHOTO-02, PHOTO-03, PHOTO-05 cases
- [ ] `src/tests/seed-species-photos.test.ts` — empty `describe` blocks for PHOTO-04, PHOTO-07, PHOTO-08 cases (D-01 fill-only, URL verbatim, rate-limit)
- [ ] `src/tests/fixtures/species-photos/` — fixture TOMLs (valid, bad-license, missing-attribution, unknown-species, empty-photos) — created lazy by tests OR seeded as files
- [ ] `@iarna/toml` added to `dependencies` in `package.json`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live iNat API photo selection (top-3 WA-preferred) | PHOTO-07 | Hitting iNat in CI is forbidden; behavior validated with fixture HTTP responses, but final shape verified by running seed once on a sample of species and inspecting the produced TOML | Run `node scripts/seed-species-photos.mjs --limit 10` against a clean tree, inspect `content/species-photos.toml` for ≥1 species with 3 WA photos and ≥1 species with global fallback |
| Wall-clock seed run on full ~735 species | PHOTO-07 | Long-running (~12 min) — out of scope for unit/integration; one-shot helper | Run `node scripts/seed-species-photos.mjs` end-to-end on empty manifest; confirm completes without error and produces valid TOML |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

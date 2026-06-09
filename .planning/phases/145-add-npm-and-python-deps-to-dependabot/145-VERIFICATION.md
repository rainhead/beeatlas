---
phase: 145-add-npm-and-python-deps-to-dependabot
verified: 2026-06-09T18:00:00Z
status: human_needed
score: 5/5
overrides_applied: 0
human_verification:
  - test: "Confirm Dependabot raises a PR for actions/cache in .github/actions/install-lychee/action.yml after the first weekly run"
    expected: "A Dependabot PR updates the SHA-pinned actions/cache reference in the composite action — confirms the github-actions entry at directory '/' covers composite actions under .github/actions/"
    why_human: "Dependabot crawler coverage for composite action directories is runtime-observable only; whether directory '/' causes the crawler to walk .github/actions/ depends on GitHub's current implementation and cannot be determined from config shape alone (WR-02 from code review)"
---

# Phase 145: Add npm + Python Deps to Dependabot — Verification Report

**Phase Goal:** Enable Dependabot version updates across all three dependency ecosystems — npm (root package.json/package-lock.json), Python (data/ via uv / pyproject.toml + uv.lock), and GitHub Actions (.github/workflows/) — with grouped/scheduled PRs to keep deps current.
**Verified:** 2026-06-09T18:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Note on Scope Expansion (D-06)

The PLAN frontmatter must_haves enumerate D-01..D-05 (three entries: github-actions, npm at /, uv at /data). During execution a code-review finding (WR-01) surfaced a fourth npm project at `infra/`. Decision D-06 was added to CONTEXT.md and actioned: a fourth entry for `npm` at `directory: "/infra"` was committed. The verify script (`verify-dependabot.py`) was updated to assert D-06 and exits 0. The live config satisfies all five PLAN must_haves AND the additional D-06. All truths below are evaluated against the final config.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | D-01: npm entry with `package-ecosystem: "npm"` and `directory: "/"` | VERIFIED | Line 15–27 of `.github/dependabot.yml`; `python3 verify-dependabot.py` → `OK npm /` |
| 2 | D-02: uv entry with `package-ecosystem: "uv"` and `directory: "/data"` (not legacy pip) | VERIFIED | Line 35–46; verify script → `OK uv /data`; no `pip` ecosystem in file |
| 3 | D-03: Every entry groups minor+patch; no entry lists major in any group | VERIFIED | All 4 entries carry a `groups:` block with `update-types: [minor, patch]`; `grep "major"` returns nothing |
| 4 | D-04: All entries use `schedule.interval: "weekly"` | VERIFIED | All 4 entries confirmed by verify script and direct YAML inspection |
| 5 | D-05: Pre-existing github-actions entry retrofitted with minor+patch group (`actions-minor-patch`) | VERIFIED | Lines 4–12; verify script → `OK github-actions /` |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.github/dependabot.yml` | Dependabot v2 config with weekly, minor+patch-grouped update entries for github-actions, npm, uv | VERIFIED | File exists, valid YAML, `version: 2`, 4 entries (github-actions /, npm /, npm /infra, uv /data); contains `package-ecosystem: "uv"` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `.github/dependabot.yml` npm entry | `package.json` / `package-lock.json` (repo root) | `directory: "/"` | VERIFIED | Both manifests exist at repo root; entry pattern `package-ecosystem: "npm"` + `directory: "/"` present |
| `.github/dependabot.yml` uv entry | `data/pyproject.toml` / `data/uv.lock` | `directory: "/data"` | VERIFIED | Both manifests exist under `data/`; entry pattern `package-ecosystem: "uv"` + `directory: "/data"` present |
| `.github/dependabot.yml` npm /infra entry (D-06) | `infra/package.json` / `infra/package-lock.json` | `directory: "/infra"` | VERIFIED | Both manifests confirmed at `infra/`; entry added by commit `828680c` |

### Data-Flow Trace (Level 4)

Not applicable. This phase modifies a static config file only — no dynamic data rendering, no application code. Dependabot itself is a GitHub-hosted service that reads this config; there is no local data flow to trace.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| YAML parses without error | `python3 verify-dependabot.py` | Exit 0, `ALL CHECKS PASS` | PASS |
| All 4 entries weekly + minor+patch grouped + major ungrouped | `python3 verify-dependabot.py` | `OK github-actions /`, `OK npm /`, `OK npm /infra`, `OK uv /data` | PASS |
| Dependabot crawler covers `.github/actions/install-lychee/action.yml` composite action | Requires GitHub to process the config | Not locally testable | SKIP — route to human (WR-02) |

### Probe Execution

No probes defined for this phase. The `verify-dependabot.py` script in the phase directory serves the equivalent role and was run above (exit 0).

### Requirements Coverage

No requirements from REQUIREMENTS.md are mapped to Phase 145 (`requirements: []` in PLAN frontmatter; grep of REQUIREMENTS.md confirms no Phase 145 entries).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | — | — | No anti-patterns found |

No TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER markers. No stub patterns applicable to a YAML config file.

### Human Verification Required

#### 1. Dependabot composite-action crawler coverage (WR-02)

**Test:** After the first Dependabot weekly run (or trigger manually via the GitHub Dependabot UI), check whether a PR is opened to update `actions/cache` in `.github/actions/install-lychee/action.yml`. The current SHA pin is `668228422ae6a00e4ad889ee87cd7109ec5666a7`.

**Expected:** A Dependabot PR updates the pinned SHA to the current release of `actions/cache`. This confirms the `github-actions` entry with `directory: "/"` causes the crawler to scan composite action files under `.github/actions/` in addition to workflow files under `.github/workflows/`.

**Why human:** GitHub's Dependabot crawler coverage for composite action directories (`/.github/actions/`) versus workflow directories (`/.github/workflows/`) is runtime-observable only. The `directory: "/"` root setting is expected to cover both, but the actual crawl scope depends on GitHub's current implementation. Code review (WR-02) flagged this as a behavior that has shifted across GitHub releases — it cannot be determined from config shape alone. If no PR appears within one weekly cycle, a dedicated `github-actions` entry for `directory: "/.github/actions/install-lychee"` should be added.

### Gaps Summary

No gaps. All five PLAN must_haves (D-01..D-05) are satisfied. The scope expansion (D-06, infra/ npm entry) is additive and correctly implemented — the verify script was updated to assert it and exits 0. The only open item is a runtime-only question (WR-02) about whether Dependabot's github-actions crawler walks composite action directories, which requires a human check after the first Dependabot run.

---

_Verified: 2026-06-09T18:00:00Z_
_Verifier: Claude (gsd-verifier)_

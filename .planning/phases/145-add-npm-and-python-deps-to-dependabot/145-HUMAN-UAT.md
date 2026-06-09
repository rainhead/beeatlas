---
status: resolved
phase: 145-add-npm-and-python-deps-to-dependabot
source: [145-VERIFICATION.md]
started: 2026-06-09
updated: 2026-06-09
---

## Current Test

[resolved 2026-06-09 — see result below]

## Tests

### 1. Composite-action crawler coverage (WR-02)
expected: After the first weekly Dependabot run (or a manual trigger from the GitHub repo's Insights → Dependency graph → Dependabot tab), a version-update PR appears for `actions/cache` pinned in `.github/actions/install-lychee/action.yml`. The `github-actions` entry uses `directory: "/"`, which should cover composite actions under `.github/actions/`, but GitHub's crawler scope for that subtree has varied across releases and can only be confirmed at runtime. If no PR appears within one cycle, add a dedicated `github-actions` entry with `directory: "/.github/actions/install-lychee"`.
result: resolved — the `directory: "/"` github-actions entry does NOT cover composite actions. Confirmed directly: when the SHA-pinning sweep (2026-06-09, commit `09ebe94`) resolved latest releases, the composite action's `actions/cache` was at v5.0.4 (`668228…`) while deploy.yml's was at v5.0.5 (`27d5ce7…`) — Dependabot had bumped the workflow-level pin (PR #17) but never the composite action's, despite both being nominally github-actions deps. Mitigated two ways: (a) manually pinned the composite action's cache to v5.0.5 in `09ebe94`; (b) added a dedicated Dependabot entry `directory: "/.github/actions/install-lychee"` so it gets future update PRs. No runtime wait was needed — the version discrepancy was conclusive.

## Summary

total: 1
passed: 1
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

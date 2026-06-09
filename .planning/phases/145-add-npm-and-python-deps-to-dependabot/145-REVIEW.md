---
phase: 145-add-npm-and-python-deps-to-dependabot
reviewed: 2026-06-09T00:00:00Z
depth: standard
files_reviewed: 1
files_reviewed_list:
  - .github/dependabot.yml
findings:
  critical: 0
  warning: 2
  info: 0
  total: 2
status: issues_found
---

# Phase 145: Code Review Report

**Reviewed:** 2026-06-09
**Depth:** standard
**Files Reviewed:** 1
**Status:** issues_found

## Summary

Reviewed `.github/dependabot.yml`, which configures Dependabot version updates for three
ecosystems: `github-actions`, `npm` (root), and `uv` (data/). The YAML is well-formed and
schema-valid. The `directory` paths for all three entries are correct — `package.json` /
`package-lock.json` live at the repo root, and `pyproject.toml` / `uv.lock` live under
`data/`. The `uv` ecosystem identifier is correct (GitHub added first-class uv support in
late 2024). Grouping syntax is valid.

Two gaps were found: the CDK infrastructure package at `infra/` has its own `package.json`
and `package-lock.json` but no corresponding Dependabot entry, so its npm dependencies
(aws-cdk-lib, constructs, aws-cdk, typescript, and two others) will never receive automated
update PRs. Additionally, the `github-actions` entry covers only workflow files at `/`, but
Dependabot does not automatically walk into local composite action directories; the
`actions/cache` pin in `.github/actions/install-lychee/action.yml` is pinned to a full SHA
with a comment tag and won't be refreshed by the current config.

---

## Warnings

### WR-01: `infra/` npm dependencies have no Dependabot entry

**File:** `.github/dependabot.yml` (missing entry; compare `infra/package.json`)
**Issue:** The repo contains a second npm project at `infra/` (`beeatlas-infra`) with its
own `package.json` and `package-lock.json` containing 7 dependencies including `aws-cdk-lib`
and `aws-cdk`. There is no Dependabot entry with `directory: "/infra"`, so those dependencies
will never receive automated update PRs. CDK and AWS SDK packages release frequently and
security-relevant patch releases are common.
**Fix:** Add a fourth entry to `dependabot.yml`:
```yaml
  # npm — infra/ package.json / package-lock.json, weekly, minor+patch grouped
  - package-ecosystem: "npm"
    directory: "/infra"
    schedule:
      interval: "weekly"
    groups:
      infra-npm-minor-patch:
        update-types:
          - "minor"
          - "patch"
```

---

### WR-02: Local composite action `install-lychee` not covered by `github-actions` Dependabot entry

**File:** `.github/dependabot.yml:4-12` (coverage gap for `.github/actions/install-lychee/action.yml`)
**Issue:** GitHub Dependabot's `github-actions` ecosystem scans workflow files under
`.github/workflows/` for `uses:` references, but it also scans composite action files under
`.github/actions/` — however, only when the root directory entry is set to `"/"`. That part
is correct. The actual issue is subtler: `.github/actions/install-lychee/action.yml` pins
`actions/cache` to a full commit SHA (`668228422ae6a00e4ad889ee87cd7109ec5666a7`) with a
version comment. Dependabot does update SHA-pinned actions to newer SHAs when it detects a
new release tag, provided it can resolve the tag. This should work with `directory: "/"` as
configured. This is a low-risk informational gap rather than a hard miss — the behavior
depends on GitHub's current Dependabot crawler scope for composite actions, which has shifted
over time. Verify that Dependabot raises a PR for this pin after the first weekly run; if not,
the `install-lychee` action's `actions/cache` dependency will silently go stale.

**Fix:** No code change required now. After the first Dependabot weekly run, confirm a PR
appears for `actions/cache` in `install-lychee/action.yml`. If no PR is generated within one
cycle, add an explicit separate entry:
```yaml
  # github-actions — local composite actions directory
  - package-ecosystem: "github-actions"
    directory: "/.github/actions/install-lychee"
    schedule:
      interval: "weekly"
```

---

_Reviewed: 2026-06-09_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

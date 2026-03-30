---
phase: 29-ci-simplification
verified: 2026-03-29T00:00:00Z
status: passed
score: 4/4 must-haves verified
---

# Phase 29: CI Simplification Verification Report

**Phase Goal:** CI runs frontend build only; no pipeline code executes in CI; fetch-data.yml is deleted
**Verified:** 2026-03-29
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Push to main triggers deploy.yml and the build job completes without any AWS credentials step, cache-restore step, S3_BUCKET_NAME env var, or id-token permission | VERIFIED | build job in deploy.yml has only `contents: read`; no `aws-actions/configure-aws-credentials`, no `S3_BUCKET_NAME`, no `cache-restore` step |
| 2 | validate-schema still runs in CI and passes by fetching parquet schema from CloudFront via Range requests | VERIFIED | `npm run validate-schema` step present in build job; `node scripts/validate-schema.mjs` exits 0, prints "ok ecdysis.parquet" and "ok samples.parquet" |
| 3 | The file .github/workflows/fetch-data.yml does not exist in the repository | VERIFIED | `test -f .github/workflows/fetch-data.yml` returns false |
| 4 | The root build script runs frontend build only, no Python pipeline | VERIFIED | `package.json` `build` script is `npm run build --workspace=frontend`; `build:data` kept separately |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.github/workflows/deploy.yml` | Frontend-only build job | VERIFIED | build job has 6 steps: checkout, setup-node, npm ci, validate-schema, build frontend, upload artifact |
| `scripts/validate-schema.mjs` | CloudFront-based schema validation with local fallback | VERIFIED | Contains `asyncBufferFromUrl`, `existsSync`, CloudFront URL, full EXPECTED object |
| `package.json` | Frontend-only root build script | VERIFIED | `"build": "npm run build --workspace=frontend"` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `scripts/validate-schema.mjs` | `https://beeatlas.net/data/` | `asyncBufferFromUrl({ url })` with Range requests | WIRED | Line 49: `asyncBufferFromUrl({ url: CLOUDFRONT_BASE + filename })` — confirmed object-arg form |
| `.github/workflows/deploy.yml` | `scripts/validate-schema.mjs` | `npm run validate-schema` step | WIRED | Line 25 of deploy.yml: `run: npm run validate-schema` |

### Data-Flow Trace (Level 4)

Not applicable — this phase produces no UI components. All artifacts are infra/script.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| validate-schema exits 0 with CloudFront fallback | `node scripts/validate-schema.mjs` | "No local parquet found -- validating against production CloudFront\nok ecdysis.parquet\nok samples.parquet\nEXIT: 0" | PASS |
| package.json build script is frontend-only | `node -e "const p=require('./package.json');console.log(p.scripts.build)"` | `npm run build --workspace=frontend` | PASS |
| fetch-data.yml is absent | `test -f .github/workflows/fetch-data.yml` | false (file absent) | PASS |
| deploy.yml build job has no AWS references | grep for `aws-actions` in build job | Only appears in deploy job (line 56), not build job | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CI-01 | 29-01-PLAN.md | `deploy.yml` removes `build:data` step; CI runs frontend build only; no Python pipeline code executes in CI | SATISFIED | build job contains only frontend steps; `build:data` not referenced; no Python |
| CI-02 | 29-01-PLAN.md | `fetch-data.yml` workflow deleted | SATISFIED | File confirmed absent from repository |

No orphaned requirements — both phase-29-mapped requirements (CI-01, CI-02) were claimed by 29-01-PLAN.md and are satisfied.

### Anti-Patterns Found

None. No TODO/FIXME/placeholder comments found in modified files. No stub implementations.

Notable observation: `package.json` retains `cache-restore`, `cache-restore-links`, `cache-upload`, `cache-upload-links`, and `fetch-inat` scripts alongside `build:data`. These are kept intentionally for local developer use (per plan D-01 rationale) and are not invoked in CI. This is correct behavior, not a stub.

### Human Verification Required

None required. All truths are mechanically verifiable and confirmed.

### Gaps Summary

No gaps. All four observable truths are verified. The phase goal is fully achieved:
- CI build job is AWS-free and pipeline-free
- Schema validation fetches from CloudFront via Range requests and passes
- `fetch-data.yml` is deleted
- Root `build` script runs frontend only

---

_Verified: 2026-03-29_
_Verifier: Claude (gsd-verifier)_

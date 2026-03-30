# Phase 29: CI Simplification — Discussion Log

**Date:** 2026-03-29

## Gray Areas Presented

1. **validate-schema fate** — Script reads from `frontend/src/assets/` (broken after Phase 28 removed those files)
2. **Root build script** — `package.json` `build` runs `build:data && build --workspace=frontend`

## Discussion

### validate-schema fate

**Q:** What should happen to this script?
- Delete it entirely
- Adapt to validate against S3
- Move to Lambda pipeline

**A:** Adapt — validate against S3/CloudFront, with local fallback. User noted: can download just the end of the file (parquet footer contains schema).

**Q:** Where should validate-schema fetch from?
- CloudFront (public, no AWS creds needed)
- S3 directly (requires AWS creds in build job)

**A:** CloudFront — no AWS creds needed in build job.

**Q:** Should it also work against local parquet files?
- Yes — auto-detect (local if exists, otherwise CloudFront)
- CloudFront only

**A:** Yes — auto-detect.

### Root build script

**Q:** What should `package.json` root `build` become?
- Frontend only (remove `build:data`)
- Leave it alone

**A:** Frontend only — remove `build:data` from the root script.

## Pre-decided (no discussion needed)

- Delete `fetch-data.yml` — unambiguous (CI-02)
- Remove `cache-restore` from deploy.yml build job — assets no longer exist after Phase 28
- Remove AWS credentials, `S3_BUCKET_NAME`, `id-token: write` from build job — follows from removing all AWS steps

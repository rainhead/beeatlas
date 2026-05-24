---
phase: 111-checklist-pipeline
plan: "02"
subsystem: infra
tags: [nightly.sh, s3, manifest, parquet, checklist, deployment]

# Dependency graph
requires:
  - phase: 111-checklist-pipeline
    plan: "01"
    provides: "checklist.parquet copied to EXPORT_DIR by run.py"
provides:
  - "data/nightly.sh: _upload_hashed call for checklist.parquet producing content-hashed S3 key"
  - "data/nightly.sh manifest.json: 'checklist' key exposing hashed filename for Phase 112 frontend"
affects: [112-checklist-map-layer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Content-hashed parquet upload via _upload_hashed (same pattern as occurrences.parquet)"
    - "manifest.json key insertion: new artifact types are added as lines before generated_at"

key-files:
  created: []
  modified:
    - data/nightly.sh

key-decisions:
  - "No --content-type override for checklist.parquet (parquet = octet-stream, same as occurrences.parquet)"
  - "CloudFront invalidation unchanged — hashed artifacts are new URLs each run; manifest.json already invalidated"
  - "checklist key placed after places_meta in manifest to preserve insertion-order readability"

patterns-established:
  - "Pattern: add new parquet artifacts to nightly.sh by appending one _upload_hashed line after places_meta_name, then one key before generated_at in the manifest heredoc"

requirements-completed: [CHECK-03]

# Metrics
duration: 5min
completed: "2026-05-24"
---

# Phase 111 Plan 02: Checklist Pipeline Summary

**Two-line nightly.sh edit wires checklist.parquet into the S3 content-hash upload sequence and exposes the hashed filename under the 'checklist' key in manifest.json for Phase 112 consumption**

## Performance

- **Duration:** 5 min
- **Started:** 2026-05-24T02:00:00Z
- **Completed:** 2026-05-24T02:05:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Added `checklist_name=$(_upload_hashed "$EXPORT_DIR/checklist.parquet" "checklist")` after the `places_meta_name` upload line
- Added `"checklist": "$checklist_name",` to the manifest.json heredoc between `places_meta` and `generated_at`
- Verified bash syntax clean, manifest heredoc parses as valid JSON, upload ordering correct, all 9 `_upload_hashed` occurrences present (1 definition + 7 prior call sites + 1 new)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add checklist upload + manifest entry to nightly.sh** - `87e3c59` (feat)

## Files Created/Modified

- `data/nightly.sh` - Added checklist.parquet upload call and manifest.json checklist key (2 insertions, no other changes)

## Git Diff (verbatim hunks)

**Hunk 1 — upload call (after places_meta_name line 156):**
```diff
+checklist_name=$(_upload_hashed "$EXPORT_DIR/checklist.parquet" "checklist")
```

**Hunk 2 — manifest key (between places_meta and generated_at lines 167-168):**
```diff
+  "checklist": "$checklist_name",
```

## Decisions Made

- No content-type override for checklist.parquet: parquet is plain octet-stream, consistent with occurrences.parquet handling
- No CloudFront invalidation change: `/data/manifest.json` is already invalidated; content-hashed `checklist-{hash}.parquet` is immutable and needs no invalidation
- Deferred CloudFront verification (curl checks) to manual UAT — requires real AWS credentials and a running nightly pipeline; see 111-VALIDATION.md Manual-Only Verifications row

## Deviations from Plan

None - plan executed exactly as written. Both edits are minimal one-liners in the specified positions.

## Issues Encountered

**grep pattern quoting:** The plan's acceptance criterion greps used unescaped shell metacharacters (parentheses, dollar signs) in a bash -c context. Used `-F` (fixed-string) grep mode to verify the patterns match exactly once. Both lines confirmed present and correctly positioned.

## Known Stubs

None. The upload and manifest key are fully wired; the content-hashed filename is generated at runtime from the actual checklist.parquet SHA-256.

## Threat Flags

No new security-relevant surface. The checklist.parquet upload reuses the existing `_upload_hashed` function with the same Cache-Control headers and AWS_PROFILE auth. The manifest.json key is public metadata — not a secret.

T-111-05 (malformed JSON) mitigated: dry-run heredoc envsubst + python3 json.loads confirmed valid JSON structure.
T-111-07 (failed upload aborts before manifest): `set -euo pipefail` already at top of nightly.sh; the new upload line is subject to the same early-exit guarantee as all other uploads.

## Next Phase Readiness

- Phase 112 frontend can now fetch `manifest.json` and resolve `manifest.checklist` to the hashed `checklist-{hash}.parquet` URL on CloudFront
- CHECK-03 complete — checklist.parquet will appear in S3 after the next nightly run

---
*Phase: 111-checklist-pipeline*
*Completed: 2026-05-24*

## Self-Check

### Files exist:
- `data/nightly.sh` (contains checklist_name upload): FOUND
- Checklist upload line at line 157: FOUND
- Checklist manifest key at line 168: FOUND

### Commits exist:
- 87e3c59 (Task 1 feat): FOUND

## Self-Check: PASSED

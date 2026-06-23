---
status: passed
phase: 160-overlap-capable-place-model-many-to-many-membership
source: [160-VERIFICATION.md]
started: 2026-06-23
updated: 2026-06-23
---

## Current Test

[complete]

## Tests

### 1. D-04 — sidebar lists all member place names for an occurrence
expected: The sidebar occurrence detail renders the occurrence's member place
name(s) as readable chips (not slugs); an occurrence in no place shows none.
result: PASS — operator confirmed "Hanford Reach National Monument" renders for
`inat_obs:320276469` after clearing a stale cached DB. Initial "no location"
report was a stale cached `occurrences.db` (no `occurrence_places` table) under
the `/app` SW; reproduced fix on HEAD via Playwright. The robustness guard
(commit `cd9e76bf`) now degrades gracefully instead of throwing on a stale DB.

note: production places.toml currently has NO true multi-place occurrence;
`inat_obs:320276469` is ONE place duplicated across source arms (occ_id
collision — backlog 999.9). Real overlaps arrive with Phase 161 (WDFW).

## Summary

total: 1
passed: 1
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

None.

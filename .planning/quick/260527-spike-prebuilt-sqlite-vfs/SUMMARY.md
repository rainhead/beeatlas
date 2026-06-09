---
status: complete
phase: quick
plan: 260527-spike
subsystem: frontend/perf
---

# Summary: Spike — prebuilt SQLite via MemoryVFS seeding

Complete. Spike concluded **GO** — fetching a prebuilt `occurrences.db` and seeding it into
the wa-sqlite worker via `MemoryVFS.mapNameToFile` before `open_v2` bypasses the INSERT loop
(~1229 ms) and parquet fetch/parse (~374–480 ms), a ~70% load-time reduction. The full
writeup is in `FINDINGS.md` (the spike's deliverable); the technique was productionized in
the v4.3 Loading Performance milestone (Phase 121).

This SUMMARY was added retroactively at the v4.7 close — the deliverable was `FINDINGS.md`,
so the scanner flagged the dir as incomplete.

# Phase 26: Lambda Handler + Dockerfile - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.

**Date:** 2026-03-28

---

## Gray Areas Presented

1. Nightly pipeline scope — selected for discussion
2. export.py output strategy — selected for discussion
3. Handler file strategy — not selected (Claude's discretion)

---

## Area 1: Nightly Pipeline Scope

**Q:** When the nightly trigger fires (pipeline: 'inat'), which steps should run?

**Options presented:**
- iNat + projects + export (Recommended) — skip geographies and ecdysis
- Full pipeline (all 5) — same as weekly run
- iNat only (no export)

**User answer (Other / free text):**
> "inat observations, projects (cheap), and ecdysis occurrences (not that expensive - less than a minute), and links (incremental, so usually a noop and occasionally a few dozen fetches)"

**Decision captured:** Nightly = ecdysis + ecdysis-links + inaturalist + projects + export. Skip geographies only.

---

## Area 2: export.py Output Strategy

**Q:** How should export.py get its output directory in Lambda vs. local dev?

**Options presented:**
- EXPORT_DIR env var (Recommended)
- output_dir parameter
- Write directly to S3

**User answer:** EXPORT_DIR env var (Recommended)

**Decision captured:** Replace hardcoded ASSETS_DIR with `os.environ.get('EXPORT_DIR', default_local_path)`. Lambda sets `EXPORT_DIR=/tmp/export`; local dev unchanged.

---

*End of discussion*

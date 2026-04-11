# Phase 44: Pipeline Wiring and Discovery - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-11
**Phase:** 44-pipeline-wiring-and-discovery
**Areas discussed:** nightly.sh pipeline sync, S3 feeds upload

---

## nightly.sh pipeline sync

| Option | Description | Selected |
|--------|-------------|----------|
| Just add feeds | Add feeds.main() to nightly.sh inline Python steps only | |
| Refactor to call run.py | Replace inline Python with `uv run python run.py` | ✓ |
| Add both missing steps | Add anti-entropy + feeds to nightly.sh inline Python | |

**User's choice:** Refactor to call run.py
**Notes:** Eliminates divergence entirely — nightly.sh was missing both anti-entropy and feeds steps from run.py's 8-step sequence.

---

## S3 feeds upload

| Option | Description | Selected |
|--------|-------------|----------|
| s3 sync | `aws s3 sync` — skips unchanged files, one command | ✓ |
| s3 cp --recursive | Always uploads all ~200 files | |

**User's choice:** s3 sync
**Notes:** ~200+ feed files generated per run; sync is clearly the right tool.

---

## Claude's Discretion

- Exact placement of autodiscovery `<link>` tag within `<head>` (conventional: after meta tags)

## Deferred Ideas

None

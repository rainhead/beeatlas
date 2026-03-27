# Phase 22: Orchestration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-27
**Phase:** 22-orchestration
**Areas discussed:** Runner format

---

## Runner Format

| Option | Description | Selected |
|--------|-------------|----------|
| Python script | data/run.py — imports pipeline modules directly, single uv run, unified error output | ✓ |
| Shell script | Replace scripts/build-data.sh with new version calling `uv run python pipeline.py` per step | |

**User's choice:** Python script

---

### Call mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Call functions directly | Import pipeline modules and call their run functions. One uv process, shared memory, proper Python tracebacks. | ✓ |
| Shell out via subprocess | subprocess.run(['uv', 'run', 'python', 'pipeline.py'], ...) per step | |

**User's choice:** Call functions directly

---

## Claude's Discretion

- Step isolation mechanism (existing `python pipeline.py` sufficient for ORCH-02 — user did not select this area)
- Anti-entropy pipeline inclusion (not listed in roadmap sequence — user did not select this area)
- Error handling behavior within run.py
- Step progress logging format

## Deferred Ideas

- npm scripts per step — not needed per user's non-selection of that area
- `--step` flag on runner — not required by roadmap success criteria

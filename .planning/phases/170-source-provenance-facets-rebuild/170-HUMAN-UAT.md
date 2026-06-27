---
status: partial
phase: 170-source-provenance-facets-rebuild
source: [170-VERIFICATION.md]
started: 2026-06-27
updated: 2026-06-27
---

# Phase 170 — Human UAT

Structural/behavioral verification passed 8/8 (see `170-VERIFICATION.md`). These two
items require a browser and human eyes; they are **not** machine-verifiable.

**Prerequisite:** the new frontend must be deployed (push `main` → `deploy.yml`) against the
already-published S3 data before these can be tested on the live site. Locally, `npm run dev`
also works once the local `public/data` is the new-contract export.

## Gaps

### UAT-01 — Tier symbology (D-08)
- **status:** pending
- **What to check:** On the map, Atlas occurrences keep the **recency color gradient** (fresh
  work pops), while Other occurrences (`inat_expert` + `checklist`) render **muted/neutral**
  (`#7a8a99`). The checklist layer should fold into that muted treatment — **no dedicated green**.
- **How:** Load the map with all tiers visible; visually confirm the two-family split and that
  recency still varies within Atlas.

### UAT-02 — Legacy `src=` back-compat restore
- **status:** pending
- **What to check:** A legacy link like `?src=ecdysis,waba_sample` still restores the correct
  visible tier set on reload (both map to `atlas`), and a `tier=atlas` link round-trips.
- **How:** Open `…/?src=ecdysis,waba_sample`, confirm the filter shows only Atlas; reload and
  confirm it persists. Then open `…/?tier=other` and confirm only Other shows.

## Sign-off

Reply with the result of each item. When both pass, the phase closes as verified.

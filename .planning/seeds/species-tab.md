---
name: Species Tab
description: Bee species exploration page — hierarchical taxonomic nav, image-forward content, occurrence maps, seasonality viz; volunteer-learning oriented
type: project
trigger_when: After v3.1 Eleventy migration completes
planted_during: v3.1 milestone scoping (2026-04-29)
---

# Species Tab — for v3.2 (post-Eleventy migration)

## Goal

Help volunteer collectors build mental models of WA bee species — seasonality, geographic distribution, identification cues, frequency. Encourage attempts at species-level identification and familiarity with noteworthy/common species.

Use cases the design should support:
- "Which species of *Eucera* are present in this ecoregion?"
- "Which species are easily identifiable from photos / a particular character / timing?"
- "Which have blue eyes?"
- "Which are most likely / frequently collected?"

## Shape

Single page: hierarchical vertical nav on the left (family → subfamily → tribe → genus → subgenus). Selecting a subgenus shows all species under it (with specimen data **or** in the WA state checklist), each rendered as a card with summary info, photos, and a static occurrence map. Optional filtering (geography, seasonality only — see "Deferred" below).

Species detail pages: out of scope for this milestone; possibly future.

## Decisions Locked During Scoping

| Decision | Why |
|----------|-----|
| Static SVG occurrence maps generated in Python from existing GeoJSON + occurrences | Visual fidelity to SPA basemap not required; informational use; no new headless-browser tooling; per-species image links to SPA pre-filtered (`/collection?taxon=...`) |
| Photos via TOML manifest checked into repo, no build-time queries | Manifest filled by query/algorithm at species-add time, then manually editable. Avoids iNat rate limits and build flakiness. WABA + non-WABA CC-licensed photos acceptable |
| Taxonomy primary source: Ecdysis | Aligns with existing pipeline and other systems |
| Tribe (and other gaps) filled from iNaturalist | Ecdysis DarwinCore lacks tribe; iNat fills gaps when needed |
| Filter scope limited to occurrence-derived attributes (geography, seasonality) | "Attributes" (eye color, ID character, ease of photo ID) deserve their own design activity — deferred to a later milestone |
| Descriptions: short, ID-helpful notes | e.g. "male hind femur width >= height". Authored, not extracted |
| Seasonality viz: mimic format from Wiley paper | https://onlinelibrary.wiley.com/doi/10.1002/ece3.72049 — code/data at `~/dev/BeeSearch`. May surface other stats/viz ideas worth borrowing |

## Open Questions for v3.2 Spec

- WA state checklist source — which authoritative list, and how is it ingested?
- Photo manifest TOML schema (per-species photo IDs, captions, attribution, ordering) — design before populating
- Largest subgenus rendering — Osmia has 80–90 species; need to verify largest subgenus and decide pagination/lazy-load
- Filter UX on a single page with potentially dozens of species
- Seasonality viz — pick representative species for prototyping mimicry; review BeeSearch repo for additional viz ideas (statistics, distributions)
- Eleventy authoring loop for the photo TOML — manual editing workflow, validation, preview

## Why This Matters

Tightens the "tighten learning cycles" axis of the project. Volunteers can move from "I collected this thing" toward "I know what this thing is and where/when to expect more like it." Aligns with project goals in `.planning/notes/project-goals-liveness-community.md`.

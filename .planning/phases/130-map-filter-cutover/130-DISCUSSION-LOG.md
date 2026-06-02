# Phase 130: Map Filter Cutover - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-02
**Phase:** 130-Map Filter Cutover
**Areas discussed:** Autocomplete content & disambiguation

---

## Autocomplete content & disambiguation

### Inclusion rule — which taxa appear

| Option | Description | Selected |
|--------|-------------|----------|
| Any with a renderable record | ≥1 descendant record across ALL sources (specimens + iNat + checklist); no dead-end filters; fixes specimen-only inconsistency | ✓ |
| Point occurrences only | ≥1 descendant specimen/iNat point; excludes checklist-only species | |
| All hierarchy bee taxa | Every Anthophila taxon, even zero-occurrence | |

**User's choice:** Any with a renderable record.
**Notes:** User then asked how complexes show up under this rule. Verified against
shipped `occurrences.db`: **0** occurrences resolve directly to a complex
`taxon_id`; all 29 bee complexes appear only via descendant species — so the
descendant-query handles them with no special-casing. Surfaced 41 cross-rank
name-twins in two patterns (15 genus/subgenus, ~14 species/complex, e.g. *Bombus
fervidus* = species 52774 AND complex 1266534), which reframed the labels question.

### Labels — disambiguating the 41 name-twins

| Option | Description | Selected |
|--------|-------------|----------|
| Uniform (rank) suffix | `(genus)`/`(subgenus)`/`(complex)` on all non-species; species plain | |
| Natural phrasing for complexes | complexes as "*X* complex"; genus/subgenus parenthetical; species plain | ✓ |
| (rank) on everything | parenthetical incl. species | |

**User's choice:** Natural phrasing for complexes.
**Notes:** Follow-up resolved the unspecified higher ranks → "Plain for higher
ranks" (family/subfamily/tribe/subtribe shown bare, since unique & non-colliding).

### Counts — show occurrence counts per entry

| Option | Description | Selected |
|--------|-------------|----------|
| No counts | Name + rank only, as today; lighter index | ✓ |
| Show counts | e.g. `Bombus fervidus (complex) · 683` | |

**User's choice:** No counts.

### Higher-rank labels (follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| Plain for higher ranks | `Apidae`, `Apinae`, `Bombini` bare | ✓ |
| (rank) on all non-species | `Apidae (family)`, etc. | |

**User's choice:** Plain for higher ranks.

### Ordering — when a prefix matches multiple ranks (follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| Broader ranks first | family → … → species, then alphabetical within rank | ✓ |
| Exact/prefix match first | closest string match floats up | |
| Grouped by rank | section headers per rank | |

**User's choice:** Broader ranks first.

---

## Claude's Discretion

User chose "Capture defaults, write context" for the remaining three areas rather
than discussing them — defaults captured in CONTEXT.md as D-06 / D-07 / D-08:
- **URL format & back-compat (D-06)** — `taxon=<id>` integer, drop `taxonRank`,
  legacy name-format fallback via cache.
- **Detail-card resolution (D-07)** — switch to hierarchy-cache lookup by
  `taxon_id`; "No determination" for null taxon.
- **Cache-load strategy (D-08)** — lazy (never on boot path); precompute-index vs
  worker-compute left for research.

## Deferred Ideas

- Occurrence counts in autocomplete (declined; revisit if wanted).
- Grouped-by-rank autocomplete (rejected for flat broader-first list).
- Reviewed-but-not-folded todos: `cluster-selection-visual-feedback.md`,
  `data-test-suite-environmental-deps.md` (both out of scope for the filter cutover).

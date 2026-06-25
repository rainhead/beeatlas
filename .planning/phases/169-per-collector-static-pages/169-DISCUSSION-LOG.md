# Phase 169: Per-Collector Static Pages - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-25
**Phase:** 169-per-collector-static-pages
**Areas discussed:** Page gate, Stats & status split, Index & build assertion
**Area delegated to Claude:** Map deep-link

---

## Area selection

| Option | Selected |
|--------|----------|
| Page gate (who) | ✓ |
| Map deep-link | (delegated to Claude) |
| Stats & status split | ✓ |
| Index & assertion | ✓ |

---

## Page gate (who gets a page)

| Option | Description | Selected |
|--------|-------------|----------|
| Specimen-backed (~121) | login with ≥1 Ecdysis specimen (`ecdysis_id IS NOT NULL`) | |
| WABA arms only (17) | only `waba_sample`/`waba_specimen` arms | |
| Any non-NULL login (4,858) | literal ROADMAP criterion 1/5; includes ~4,702 casual observers | |
| Collected OR sampled | specimen-backed OR sample-host (`waba_sample`) | ✓ |

**User's choice:** Collected OR sampled → predicate `ecdysis_id IS NOT NULL OR source='waba_sample'`.
**Notes:** Resolves the live contradiction — STATE.md `[v6.0 PAGE]` named a now-dead
`collector_identity.csv` seed (killed by Phase 167 D-04); the derived predicate preserves the
"exclude casual observers" intent. Sized to **124 pages today** (121 specimen + 16 sample, 13 overlap).

---

## Stats & status split

### PAGE-03 status split — denominator + "identified" definition

| Option | Description | Selected |
|--------|-------------|----------|
| Specimens; id_date present | denominator = specimens; identified = `id_date IS NOT NULL` | |
| All occurrences; has taxon | denominator = all occurrences; identified = any taxon_id | |
| Specimens; taxon OR id_date | specimens; identified = tentative iNat species OR id_date | |

**User's choice (free text):** *"identified means identified to species. Note that some people
identify their own specimens, and only get identifications from project staff if those
identifications were wrong."*
**Notes:** Refined the definition — "identified" = a **species-rank (or finer) determination
exists**, regardless of who made it (self-IDs count). Keys on **taxon rank**, NOT `id_date`.
Confirmed: denominator = the collector's **specimens** (Ecdysis-backed + `waba_specimen`);
genus-or-coarser = **awaiting ID**. `id_date` stays the Phase 171 event-stream timestamp.

### Page H1 / display name

| Option | Description | Selected |
|--------|-------------|----------|
| Human name, login fallback | human name when known, else `@login` | ✓ |
| @login only | iNat handle verbatim | |
| Human name + @login | both, e.g. "Jane Doe (@janedoe)" | |

**User's choice:** Human name with `@login` fallback (export resolves name from `recordedBy`).

---

## Index & build assertion

### Index page

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, like /places.html | `_pages/collectors.njk` roster mirroring `_pages/places.njk` | ✓ |
| Detail pages only | no index | |
| Yes, sorted by contribution | index sorted by specimen count | |

**User's choice:** Yes, like /places.html (places-pattern default order).

### Criterion-5 page-count floor

| Option | Description | Selected |
|--------|-------------|----------|
| Vitest test, floor ~100 | assert `collectors.json` length ≥ 100, parallel to `data-places.test.ts` | ✓ |
| Python export, floor ~100 | `collectors_export.py` raises below floor | |
| Both layers | enforce in export AND Vitest | |

**User's choice:** Vitest test, floor ≥ 100 (CI/deploy gate; ~20% headroom under today's 124).

---

## Claude's Discretion

- **Map deep-link (criterion 4 / PAGE-04)** — user delegated. Recommended default (D-10):
  `collectors.json` carries `recordedBy` + `host_inat_login`; page deep-links via the existing
  `?collectors=` param, no new `FilterState` dimension. **Research flag:** verify a single login's
  records are fully captured (a login may map to multiple `recordedBy:host_inat_login` pairs);
  fallback is a `?collector={login}` param keyed on `collector_inat_login`.
- `collectors_export.py` SQL shape, occ_id reconstruction, name-resolution join location.
- Page layout/styling (reuse `places.css` vs new), empty-state copy.

## Deferred Ideas

- Per-collector event stream / `id_date` as the "Identified" timestamp — **Phase 171**.
- Accomplishment view (county map, taxonomic/ecoregion breadth, seasons badge) — **Phase 172**.
- `?collector={login}` frontend filter dimension — only if the D-10 research flag forces it.
- Casual-observer pages (the 4,702 excluded logins) — out of scope by gate (D-01/D-02).

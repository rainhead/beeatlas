# Phase 168: Temporal Lifecycle Dates - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-25
**Phase:** 168-temporal-lifecycle-dates
**Areas discussed:** Feed scope, Events to surface, Column shape, Date type & dirty-value policy, "Identified" definition

---

## Feed scope (which arms get a history)

Opened with four data-layer questions (ARM 4 missing `created_at`, date type,
collection_date reconciliation, transition plumbing). User redirected: the history
surface is **volunteers' work = WABA specimens**, "not much to say about samples."

**User's choice:** Feeds = WABA specimens only (ecdysis WABA-collected + waba_specimen).
Samples, expert iNat, and checklist are out of feeds.
**Notes:** This dissolved the ARM 4 "missing created_at" concern — expert iNat isn't
in any feed, so no source re-pull is needed.

---

## Events to surface

User's framing question: "you haven't laid out what events you actually want to
surface... Why would a volunteer care what day they posted a photo of a specimen?"
Claude laid out a candidate timeline (Collected / Posted / Catalogued / Identified)
with data availability per event.

| Candidate event | Anchor date | Availability | Outcome |
|--------|-------------|----------|----------|
| Collected | event_date / observed_on | available | **kept** (existing `date`) |
| Posted to iNat | `created_at` | available | **dropped** (administrative, not meaningful) |
| Catalogued in Ecdysis | none (only `modified`) | fuzzy | **dropped** (no trustworthy date) → status facet |
| Identified | `date_identified` | available (dirty) | **kept** (new `id_date`) |

**User's choice:** Two dated events — **Collected + Identified**. Drop posting and
cataloguing as events. ("yes, right")
**Notes:** Overrides ROADMAP criterion 1 / TEMP-01 naming of `posted_date`.

---

## Column shape

| Option | Description | Selected |
|--------|-------------|----------|
| Add only `id_date` | Reuse existing `date` as collection date; add one VARCHAR column. Contract 37→38. | ✓ |
| Add `collection_date` + `id_date` | Both spec-named columns, keep `date`. Contract 37→39. | |

**User's choice:** Add only `id_date` (reuse `date` as collection date). Contract 37→38.
**Notes:** Leanest bump; `date` already holds the collection/event date for every
specimen arm. Naming caveat (spec says collection_date) recorded in CONTEXT.

---

## Date type & dirty-value policy

Presented as a recommendation (VARCHAR keep-partials) rather than a forced choice,
given live data shows ecdysis `date_identified` is ~26k year-only vs ~17 full dates.

**User's choice:** Accepted VARCHAR, partials preserved (year-only kept;
blank/`s.d.`/garbage → NULL). A strict DATE would erase the year-only ID signal.
**Notes:** Satisfies ROADMAP criterion 3 (partial dates handled, not dropped).

---

## "Identified" definition (not-yet-catalogued specimens)

| Option | Description | Selected |
|--------|-------------|----------|
| Formal Ecdysis determination only | waba_specimen id_date = NULL ("awaiting ID"); no new source. | ✓ |
| iNat community ID counts | id_date from iNat identification date; needs research / source extension. | |

**User's choice:** Formal Ecdysis determination only. A not-yet-catalogued
waba_specimen reads "Collected, awaiting ID" (its iNat species still shows via
`canonical_name`).
**Notes:** Avoids any source-pull extension; keeps the phase dbt-only.

---

## Claude's Discretion

- Exact `date_identified` parse implementation and its home (inline ARM 1 vs.
  `int_ecdysis_base` helper).
- Whether `sqlite_export.py` needs explicit change or carries `id_date` through.
- Exact dbt-test predicate/severity for the parse-coverage assertion.

## Deferred Ideas

- iNat community-ID identification dates for un-catalogued specimens (future phase).
- Cataloguing as a dated milestone (needs a reliable Ecdysis accession date).
- `posted_date` / submission-progress timeline (trivial re-add if ever wanted).
- Provenance/status facet (in-iNat vs in-Ecdysis) — Phases 170/171.

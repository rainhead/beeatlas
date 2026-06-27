# Phase 171: Per-Collector Event Stream - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-27
**Phase:** 171-per-collector-event-stream
**Areas discussed:** Event model & cataloguing, Feed unit & sorting, Pagination / bounding, Event card content

> **Note:** the operator originally invoked `/gsd-discuss-phase 168 --chain`, but
> Phase 168 was already complete + shipped (verified 7/7, `id_date` live in S3).
> Confirmed the intent was the next open phase, **171**, and re-targeted.

---

## Event model & cataloguing

| Option | Description | Selected |
|--------|-------------|----------|
| No separate event | Cataloguing is a provenance change, not a dated event; feed stays Collected + Identified; specimen is one continuous row (168 D-10) | ✓ |
| Undated state marker | Show a "Catalogued" badge, not date-positioned | |
| Dated via proxy | Render "Catalogued" at a proxy date (id_date/modified) | |

**User's choice:** No separate event (→ D-EVENT-01)
**Notes:** STREAM-02 satisfied structurally; honors 168 D-03 (no trustworthy cataloguing date).

| Option | Description | Selected |
|--------|-------------|----------|
| Hold 168 D-08 line | Feed uses only formal-Ecdysis ID; waba_specimen reads "awaiting ID"; no iNat pull extension | ✓ |
| Extend iNat pull | Fetch iNat identification `created_at` for pre-catalogue specimens | |
| Decide after research | Quantify the gap first | |

**User's choice:** Hold 168 D-08 line (→ D-EVENT-02)
**Notes:** Operator confirmed iNat ID dates exist in the source but stay unpulled this phase.

---

## Feed unit & sorting

| Option | Description | Selected |
|--------|-------------|----------|
| One entry per event | Flat reverse-chron stream; a specimen yields up to two entries | ✓ |
| One entry per specimen | Lifecycle card showing both dates | |

**User's choice:** One entry per event (→ D-FEED-01)

**Mid-area clarifications (operator-driven, reshaped this area):**
- Operator asked whether source records actually carry the identification date.
  Finding: Ecdysis `date_identified` (dwc:dateIdentified) exists but is mostly
  **year-only / blank**; iNat ID dates exist but are unpulled (168 D-08). So the
  date is "present but degraded," not absent.
- Operator: *"it's pretty safe to use ecdysis identification modification time to
  mean 'when the identification was made available'."* → adopted the precise
  `identifications.modified` timestamp as the Identified-event sort key
  (→ **D-IDSRC**), a documented reversal of 168 D-03 (which rejected `modified` as
  a *determination* date — here it means *availability*). Precedent: `data/feeds.py`.

| Option | Description | Selected |
|--------|-------------|----------|
| Current determination only | One Identified event/specimen (`is_current='1'`) | (initially selected) |
| Full re-determination history | Every determination is its own event | ✓ (override) |

**User's choice:** Full re-determination history (→ D-FEED-02)
**Notes:** Operator initially picked current-only, then interrupted: *"that's a lot
more reidentification than I expected. Let's retain them all."* The high
re-determination volume (most specimens have ≥2 IDs) makes the correction arc the
interesting story.

**Derived sort (D-SORT):** reverse-chron by best-available timestamp — Identified
by `modified` (precise), Collected by coarse `event_date`; tiebreak = planner discretion.

---

## Pagination / bounding

| Option | Description | Selected |
|--------|-------------|----------|
| Cap most-recent N | Carry only N most-recent events per collector | |
| Eleventy paginated sub-pages | Static `/page/2/` sub-pages, zero JS, bounded DOM | ✓ |
| Progressive-enhancement toggle | Bounded chunk + client "show more" script | |

**User's choice:** Eleventy paginated sub-pages (→ D-PAGE-01)
**Notes:** Preserves the JS-free collector page; full history browsable. Chunk size
(~50) + 2-D pagination mechanism = planner's call. Full re-ID history inflates
event volume, so the bound matters.

---

## Event card content

| Option | Description | Selected |
|--------|-------------|----------|
| Determiner name | "identified by X" on Identified events | ✓ |
| Link to specimen | Ecdysis/iNat source link per event | |
| Place / floral host | County/place + host context | |
| Taxon page link | Species links to /taxa page | ✓ |

**User's choice:** Determiner name + Taxon page link (→ D-CARD-01, D-CARD-02)
**Notes:** Lean card — no specimen link, no place/host context (D-CARD-03). Layout/
styling deferred to a future `/gsd-ui-phase` (phase is `UI hint: yes`).

---

## Claude's Discretion

- Per-page chunk size + Eleventy 2-D pagination mechanism (D-PAGE-01).
- Within-year sort tiebreak for mixed-granularity events (D-SORT).
- Event-data location: embedded in `collectors.json` vs. a sibling file.
- "Identified" vs "Re-identified" labeling; whether to show the stated year
  alongside `modified`.
- Empty-state copy for the 16 sample-host-only collectors (D-EMPTY).

## Deferred Ideas

- iNat per-identification dates for pre-catalogue waba_specimen (168 D-08).
- Sample collection events in the feed (out of scope per 168).
- Direct specimen links + place/host context on events (D-CARD-03).
- Cataloguing as a dated milestone (168 D-03).
- Accomplishment view — Phase 172.

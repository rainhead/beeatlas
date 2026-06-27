---
phase: 171
plan: 03
type: human-uat
status: pending-operator
created: 2026-06-27
auto_advance: false
---

# Phase 171 — Human UAT Checklist: Per-Collector Event Stream

> Operator runs this checklist against a built preview (`npm run build && npx @11ty/eleventy --serve`
> or just a static preview of `_site/`). Sub-page pagination is only available in build mode —
> the dev HMR guard returns `[]` for `collectorEventPages`. A plain `npx @11ty/eleventy` build
> followed by `npx serve _site` suffices; pagination URLs are static routes on disk.
>
> The automated pre-checks (Revision 4) confirmed:
> - `npm test`: 892 passed (structural assertions updated for table)
> - `uv run pytest -m "not integration"`: 259 passed, 9 skipped
> - Build-mode Eleventy generates `collectors/swisschick/page/2/index.html` with 100 `<tr class="event-row">`
>   elements inside `<table class="event-feed">` (swisschick: 14,754 events, 148 pages)
> - No `<script` tags in event-feed templates; the two script tags in generated HTML are the
>   site-wide `bee-header` from `default.njk` layout (expected)
> - Feed is now a real `<table>` with `<thead>` (Date/Catalog/Event/Taxon/Determiner) wrapped
>   in `<div class="event-feed-wrap">` for horizontal scroll on mobile

---

## Scenario 1 — HIGH-VOLUME collector: swisschick (14,754 events, 148 pages)

**URL (page 1):** `/collectors/swisschick/`

- [ ] 1.1 The "Collection history" section heading (`<h2>`) is visible.
- [ ] 1.2 The feed renders as a list of events. First event should be dated **2026-06-02** and labelled
      **"Identified"** (green label — most recent identification).
- [ ] 1.3 Events are in **newest-first** order: dates decrease as you scroll down the page.
- [ ] 1.4 At the bottom of the feed, a **"Older events →"** link appears (pointing to `/collectors/swisschick/page/2/`).
      No "← Newer events" link and no "Page N of M" indicator on the main page.

**URL (page 2):** `/collectors/swisschick/page/2/`

- [ ] 1.5 The page renders (not 404).
- [ ] 1.6 The nav shows **"← Newer events"** (links to `/collectors/swisschick/`),
      **"Page 2 of 148"**, and **"Older events →"** (links to `/collectors/swisschick/page/3/`).
- [ ] 1.7 The feed contains events and they continue the reverse-chron sequence from page 1.

**URL (last page):** `/collectors/swisschick/page/148/`

- [ ] 1.8 The page renders (not 404).
- [ ] 1.9 The nav shows **"← Newer events"** and **"Page 148 of 148"** but **NO "Older events →"** link.

---

## Scenario 2 — SMALL collector: avajasman (2 events, 1 page)

**URL:** `/collectors/avajasman/`

- [ ] 2.1 The "Collection history" section renders with a small number of events (2 total).
- [ ] 2.2 **No pagination nav** appears (no "Older events →", no page indicator) — single-page collection.
- [ ] 2.3 Events are in reverse-chron order (newest first).

---

## Scenario 3 — SAMPLE-HOST-ONLY collector: apascal (0 specimen events)

**URL:** `/collectors/apascal/`

- [ ] 3.1 The "Collection history" section heading is visible.
- [ ] 3.2 The section shows the **empty state**: `"No specimen events recorded yet."` (`.metadata` class — muted small text).
- [ ] 3.3 No `<table>` feed or event rows appear. No broken or empty table element.
- [ ] 3.4 The existing stats line (`0 specimens · N samples · 0 species`) and atlas link still render above the section.

---

## Scenario 4 — ROW CORRECTNESS: acfranz (350 events, re-ID arc + undetermined + genus link)

**URL:** `/collectors/acfranz/`

The first page of acfranz has all four row variants on one page.

### 4a — Re-identified arc (REVISED 2026-06-27: chronological labels + catalog column)

Label semantics changed from is_current-based to chronological (operator UAT revision):
- "Identified" = chronologically FIRST determination for this specimen
- "Re-identified" = any SUBSEQUENT determination
- Color (green/muted) is driven by is_current (currently accepted vs superseded), orthogonal to label.

Around position 73–80 in the feed (scroll well down past the Eumeninae and Lasioglossum entries),
find the **Heriades** cluster dated **2025-10-06**:

- [ ] 4a.1 **"Re-identified"** rows for **"Heriades carinata"** appear just above the "Re-identified" rows for
      "Heriades" (reverse-chron: the current re-determination date-ties with the superseded one; the current
      appears first). **Both are labeled "Re-identified"** because each had a prior determination even earlier.
- [ ] 4a.2 The "Heriades carinata" rows use **green label text** (`event-type--identified` class, is_current=True).
      The "Heriades" rows use **muted label text** (`event-type--reidentified` class, is_current=False).
- [ ] 4a.3 The "Heriades" row links to **`/species/Heriades/`** (genus-only URL).
- [ ] 4a.4 The "Heriades carinata" row links to **`/species/Heriades/carinata/`**.
- [ ] 4a.5 Both rows show **`by Karen W. Wright`** as the determiner.
- [ ] 4a.6 Both rows show a **catalog number** linked to `ecdysis.org/collections/individual/index.php?occid=...`
      (the `WSDA_*` catalog number appears as the link text).

To see the **"Identified"** label (first determination per specimen), look for early rows near the bottom of
the first page — these are the specimens' original identifications and should render as "Identified".
Specifically, rows labeled **"Identified"** with green text are first determinations that are still current.
Rows labeled **"Identified"** with muted text are first determinations that were later superseded.

### 4b — Determiner names

- [ ] 4b.1 Rows with a determiner show **`by {Name}`** (e.g. "by Karen W. Wright", "by Joel D. Gardner").
- [ ] 4b.2 Rows where the determiner is `unknown` (or any row without a real named determiner) — confirm
      whether these show "by unknown" or omit the determiner. The template renders the `determiner` field
      verbatim only when truthy; "unknown" is a real string value so it will appear as "by unknown".
      This is acceptable — the plan does not require filtering "unknown" from display.

### 4c — Undetermined (plain text, no link)

Near the bottom of the first page, find rows dated **2026-01-29** labelled **"Identified"** with taxon **"undetermined"**:

- [ ] 4c.1 "undetermined" renders as **plain text**, not a hyperlink.
- [ ] 4c.2 No broken anchor tag or empty `<a href="">` surrounds the word.
- [ ] 4c.3 The row reads cleanly: `[date] Identified undetermined by unknown` (muted determiner).

### 4d — Non-bee determination links to iNaturalist (NEW — 2026-06-27 enhancement)

Near the top of the acfranz feed, find a row with taxon **"Eumeninae"** or **"Diptera"**:

- [ ] 4d.1 "Eumeninae" (or "Diptera") is rendered as a **hyperlink** pointing to
      `https://www.inaturalist.org/taxa/Eumeninae` (or `/taxa/Diptera`) — the `/taxa/{name}`
      form, which iNaturalist redirects to the canonical taxon page.
- [ ] 4d.2 The link has `rel="external"` attribute and `class="event-taxon--external"`.
- [ ] 4d.3 Clicking the link lands on the iNaturalist **taxon page** for that name
      (redirect resolves). Spot-check a binomial too (e.g. a `Vespula pensylvanica` /
      `Oxybelus uniglumis` row → `/taxa/Vespula%20pensylvanica`) to confirm it redirects.
- [ ] 4d.4 The **catalog number** now appears **immediately after the date** on each row.
- [ ] 4d.4 The name text (`Eumeninae`, `Diptera`, etc.) is **not** duplicated and renders cleanly
      alongside the determiner ("by Karen W. Wright") and catalog number.

### 4e — Species link resolves (formerly 4d)

- [ ] 4e.1 Click a BeeAtlas species link (e.g. "Lasioglossum" from the top of the acfranz feed) —
      confirm it resolves to `/species/Lasioglossum/` (genus page, not an iNat link).
      Non-bee determination rows ("Eumeninae", "Diptera") go to iNat; bee rows go to BeeAtlas.

---

## Scenario 5 — AWAITING-ID (waba_specimen): mylodon page 9

**URL:** `/collectors/mylodon/page/9/`

- [ ] 5.1 The page renders.
- [ ] 5.2 Find a row with **"Collected"** label and **"awaiting ID"** annotation (italic, muted text after the taxon name).
      The specimen is **Anthophora pacifica**, dated **2026-05-08**.
- [ ] 5.3 "Anthophora pacifica" renders as **plain text** (no link — waba_specimen pending rows have `is_pending: true`
      and no species link per UI-SPEC).
- [ ] 5.4 No determiner line ("by ...") appears for this row (no determiner on pending collected rows).

---

## Scenario 6 — MOBILE WIDTH

Narrow the browser to ~375px (iPhone SE width) on the `swisschick` main page.

- [ ] 6.1 The feed table scrolls **horizontally** inside its `overflow-x: auto` wrapper — all 5 columns
      (Date, Catalog, Event, Taxon, Determiner) remain visible by scrolling; none are clipped or
      hidden, and the page itself does not overflow the viewport.
- [ ] 6.2 The header row (`<thead>`) remains sticky to the left as expected for a horizontal-scroll table.
      Confirm the "Date", "Catalog", "Event", "Taxon", "Determiner" column headers are visible.
- [ ] 6.3 Pagination links on `/collectors/swisschick/page/2/` have a comfortable vertical tap target
      (the "← Newer events" and "Older events →" links should not be cramped).
- [ ] 6.4 No overflow of the "Page N of M" indicator beyond the viewport.

---

## Operator Results

Record pass/fail per scenario after completing UAT.

| Scenario | Description | Result | Notes |
|----------|-------------|--------|-------|
| 1 | High-volume: swisschick pagination | | |
| 2 | Small: avajasman single page | | |
| 3 | Sample-host-only: apascal empty state | | |
| 4a | Re-ID arc: acfranz Heriades | | |
| 4b | Determiner names | | |
| 4c | Undetermined plain text | | |
| 4d | Non-bee iNat link (Eumeninae/Diptera) — NEW | | |
| 4e | BeeAtlas species link resolves | | |
| 5 | Awaiting-ID: mylodon page 9 | | |
| 6 | Mobile width + wrapping | | |

**Overall result:** [ ] APPROVED — all scenarios pass
[ ] GAPS — describe issues below and file a follow-up pass

**Issues found:**

(none yet — pending operator UAT)

---

## Decisions Verified by UAT

| Decision | Verified by scenario |
|----------|---------------------|
| D-EVENT-01: Collected event carries collection date | 1, 2 |
| D-EVENT-02: Identified event carries identification date | 4a |
| D-FEED-01: Reverse-chronological order | 1.2, 1.3 |
| D-FEED-02: waba_specimen shows as Collected + awaiting ID | 5 |
| D-SORT: Newest-first pre-sorted by export | 1.3 |
| D-PAGE-01: Paginated at 100 events/page into static sub-pages | 1.5–1.9 |
| D-CARD-01: Rank-aware species/genus links | 4a.3, 4a.4, 4e |
| D-CARD-02: bee → BeeAtlas; non-bee named → iNat; undetermined → plain text | 4c, 4d, 4e |
| D-CARD-03 (REVISED): Catalog number + Ecdysis link present for catalogued events; waba_specimen empty | 4a.6, 5 |
| Chronological labels: first determination = "Identified"; later = "Re-identified" | 4a.1, 4a.2 |
| Color orthogonal to label: green = is_current; muted = superseded | 4a.2 |
| D-EMPTY: Empty state for sample-host-only collectors | 3 |

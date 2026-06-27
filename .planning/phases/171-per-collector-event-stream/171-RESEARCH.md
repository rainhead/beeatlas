# Phase 171: Per-Collector Event Stream - Research

**Researched:** 2026-06-27
**Domain:** Eleventy static-page generation / DuckDB event export / reverse-chronological feed
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-EVENT-01: Feed has exactly two event kinds: Collected and Identified. No cataloguing event.
- D-EVENT-02: Not-yet-catalogued waba_specimen reads as "Collected, awaiting ID"; no Identified event; canonical_name may display as context. Do NOT extend iNat pull (168 D-08 holds).
- D-IDSRC: Identified event is timestamped by `ecdysis_data.identifications.modified` (precise TIMESTAMPTZ) used as "availability timestamp." Deliberate reversal of 168 D-03. Precedent: feeds.py already uses modified this way.
- D-FEED-01: Flat stream, one entry per event.
- D-FEED-02: Retain full re-determination history — every determination (current + superseded, `identification_is_current` '1'/'0') is its own Identified event.
- D-SORT: Reverse-chronological by best-available timestamp per event (Identified = modified, Collected = event_date). Within-year tiebreak is planner discretion.
- D-PAGE-01: Bound via Eleventy-generated paginated sub-pages (`/collectors/{login}/page/N/`). Fully static, zero new JS. Chunk size and mechanism are planner discretion.
- D-CARD-01: Identified events carry determiner name (identified_by; blank → render "identified" without name).
- D-CARD-02: Species name links to /species/{slug}/ (existing taxa page).
- D-CARD-03: No specimen link, no place/floral-host context on events.
- D-EMPTY: 16 sample-host-only collectors have no feed events; render empty-state.

### Claude's Discretion
- Per-page chunk size and the Eleventy pagination mechanism (D-PAGE-01).
- Within-year sort tiebreak for mixed-granularity events (D-SORT).
- Where per-collector event data lives: embedded in collectors.json vs separate file.
- Exact "Identified" vs "Re-identified" labeling of superseded vs current determinations.
- Whether to show stated year (date_identified) alongside modified-derived position.

### Deferred Ideas (OUT OF SCOPE)
- iNat per-identification dates for not-yet-catalogued waba_specimen (D-EVENT-02/168 D-08).
- Sample collection events in the feed.
- Direct specimen links (Ecdysis/iNat) and place/floral-host context on events (D-CARD-03).
- Cataloguing as a dated milestone.
- Accomplishment view (Phase 172).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STREAM-01 | Collector page shows reverse-chronological collection→identification event feed | Answered by Q1 (Eleventy mechanism), Q4 (join path), Q6 (sort key) |
| STREAM-02 | waba_specimen→ecdysis transition appears as event in feed | Satisfied structurally by D-EVENT-01 (continuous row, no delete+create); confirmed by ARM-3 de-dup existing in mart |
| STREAM-03 | Feed paginates/bounds for high-volume collectors (500+ records) | Answered by Q1 (Eleventy 2D pagination) + Q2 (sizing confirms 100 events/page produces 1,186 sub-pages for 90 collectors) |
</phase_requirements>

---

## Summary

Phase 171 adds a reverse-chronological Collected→Identified event feed to the existing per-collector static page (`/collectors/{login}/`, Phase 169). All six research questions from the CONTEXT have been answered against live data from `data/beeatlas.duckdb`.

The Eleventy 2D pagination problem is solved by pre-flattening `(collector, page-chunk)` descriptors in the Python export. The main collector page (`collector-detail.njk`) shows the first chunk of events from extended `collectors.json`; a new template (`collector-events-page.njk`) paginates a flat `collector_event_pages.json` array for pages 2+. Both templates are fully static with zero client JS.

Event volume is substantial: 123,977 total events across 121 WABA collectors. At 100 events/page, 1,186 sub-pages cover 90 collectors that exceed the first page. The sub-page data file (`collector_event_pages.json`) is ~24 MB as a build artifact — acceptable since it is Eleventy-read at build time and never served to browsers by the SPA.

The identifications join path mirrors `feeds.py` exactly (`i.coreid = CAST(o.ecdysis_id AS VARCHAR)`). Superseded identification rows correctly preserve their original `modified` timestamps, meaning the full re-determination arc (D-FEED-02) reads chronologically correct. The species→/taxa link resolves for about one-third of all identification rows; the remaining two-thirds are genus-level, "undetermined", or higher-rank names that display as text without a link.

**Primary recommendation:** Use 100 events/page, pre-flatten descriptors in `collectors_events_export.py`, extend `collectors.json` with first-page events + pagination metadata, emit `collector_event_pages.json` for pages 2+, add a second `_data/collectors.js` export for the sub-pages array, and create two Nunjucks templates.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Event aggregation + sorting | Pipeline (Python/DuckDB) | — | Static hosting; no browser GROUP BY; all aggregation must be pre-computed |
| Taxon page slug resolution | Pipeline (Python) | — | species.parquet carries slug; join happens at export time |
| Identified-event join (identifications table) | Pipeline (Python/DuckDB) | — | Raw Ecdysis table accessed only from pipeline; not exposed to frontend |
| Pagination chunking | Pipeline (Python) | Eleventy | Python pre-chunks; Eleventy paginates the flat descriptor array |
| Static page generation | Eleventy (_pages templates) | — | `_data` loader → `_pages` template pattern |
| Prev/next navigation links | Eleventy (Nunjucks template) | — | Computable from `page_num` + `total_pages` in each page descriptor |

---

## Standard Stack

### Core (all already in the project)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| DuckDB | (project) | Event query joining parquet + live duckdb | Same as collectors_export.py; reads occurrences.parquet + ecdysis_data.identifications |
| Eleventy | 3.1.6 [VERIFIED: node_modules] | Static page generation | Already used for collector-detail.njk |
| Nunjucks | (Eleventy bundled) | Template language | All existing _pages templates use Nunjucks |
| Python 3.14+ | (project) | Export script | As per CLAUDE.md constraint |

### No new packages required

All capabilities use existing dependencies. No new npm or PyPI packages needed for this phase.

## Package Legitimacy Audit

No new external packages. Section not applicable.

---

## Architecture Patterns

### System Architecture Diagram

```
data/beeatlas.duckdb
  ecdysis_data.identifications ─────┐
  (coreid, modified, identified_by, │
   scientific_name, is_current,     │
   date_identified)                 │
                                    ▼
data/dbt/target/sandbox/       collectors_events_export.py
  occurrences.parquet ──────►  (new export step)
  (ecdysis_id, record_type,    │
   collector_inat_login,        ├── JOIN identifications ON coreid = CAST(ecdysis_id AS VARCHAR)
   date, canonical_name)        ├── LEFT JOIN species.parquet ON lower(canonical_name) = lower(scientific_name)
                                │   for slug resolution
public/data/species.parquet ───┘
  (canonical_name, slug)
                                    │
                      ┌─────────────┴─────────────────┐
                      ▼                               ▼
            collectors.json (extended)      collector_event_pages.json
            per-collector record +          flat array: {login, page_num,
            first_page_events (100)         total_pages, events: [100]}
            total_event_pages               (pages 2+ for 90 collectors)
            total_event_count               ~24 MB build artifact

                      │                               │
                      ▼                               ▼
            _data/collectors.js             _data/collectors.js (extended)
            exports: collectorsArray        exports: collectorEventPages

                      │                               │
           ┌──────────┘                    ┌──────────┘
           ▼                               ▼
 _pages/collector-detail.njk    _pages/collector-events-page.njk
 pagination: collectorsArray    pagination: collectorEventPages
 size: 1 (existing)             size: 1 (new)
 permalink: /collectors/{login}/  permalink: /collectors/{login}/page/{N}/

           │                               │
           ▼                               ▼
 /collectors/swisschick/         /collectors/swisschick/page/2/
 (shows stats + first 100 events)  (shows events 101-200, prev/next)
```

### Recommended Project Structure

New files:

```
data/
├── collectors_events_export.py     # New: event aggregation + chunking export
public/data/
├── collectors.json                  # Extended: + first_page_events, total_event_pages
├── collector_event_pages.json       # New: flat sub-page descriptor array (~24 MB)
_data/
├── collectors.js                    # Extended: also exports collectorEventPages
_pages/
├── collector-detail.njk             # Extended: render first_page_events + next-page link
├── collector-events-page.njk        # New: paginate collectorEventPages
src/tests/
├── data-collectors.test.ts          # Extended: add collectorEventPages shape assertions
```

### Pattern 1: Pre-flattened 2D Pagination (the key mechanism for D-PAGE-01)

**What:** Eleventy has no native 2D pagination. The export pre-chunks events per collector and flattens all sub-pages into a single array. Eleventy's `size:1` pagination then generates one static HTML file per descriptor.

**When to use:** Whenever you need (entity × page) static pages in Eleventy.

**Export pseudo-code:**

```python
# In collectors_events_export.py

CHUNK_SIZE = 100  # planner to confirm, per research finding

# 1. Query all events per collector, sorted DESC
events_by_collector = {}  # login -> [event, ...]
# ... DuckDB query yielding sorted events per collector ...

# 2. Chunk into pages
sub_page_descriptors = []
for login, events in events_by_collector.items():
    chunks = [events[i:i+CHUNK_SIZE] for i in range(0, len(events), CHUNK_SIZE)]
    total_pages = len(chunks)
    # First chunk goes into collectors.json record
    collector_records[login]['first_page_events'] = chunks[0] if chunks else []
    collector_records[login]['total_event_pages'] = total_pages
    collector_records[login]['total_event_count'] = len(events)
    # Pages 2+ go into the sub-page array
    for page_num, chunk in enumerate(chunks[1:], start=2):
        sub_page_descriptors.append({
            'login': login,
            'page_num': page_num,
            'total_pages': total_pages,
            'events': chunk,
        })

# 3. Write collector_event_pages.json
Path('public/data/collector_event_pages.json').write_text(
    json.dumps(sub_page_descriptors), encoding='utf-8'
)
```

**`_data/collectors.js` extension:**

```js
// Source: established pattern in _data/collectors.js [ASSUMED]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

const collectorsArray = JSON.parse(
  readFileSync(join(repoRoot, 'public/data/collectors.json'), 'utf8')
);
const collectorEventPages = JSON.parse(
  readFileSync(join(repoRoot, 'public/data/collector_event_pages.json'), 'utf8')
);

export default { collectorsArray, collectorEventPages };
```

**`_pages/collector-events-page.njk` front matter:**

```yaml
---
pagination:
  data: collectors.collectorEventPages
  size: 1
  alias: evpage
permalink: "/collectors/{{ evpage.login | urlencode }}/page/{{ evpage.page_num }}/index.html"
eleventyComputed:
  title: "{{ evpage.login }} — BeeAtlas (page {{ evpage.page_num }})"
layout: default.njk
---
```

**Prev/next nav in the sub-page template:**

```nunjucks
{# Previous: page N-1 or main page (page 1) #}
{% if evpage.page_num == 2 %}
  <a href="/collectors/{{ evpage.login | urlencode }}/">← Newer</a>
{% else %}
  <a href="/collectors/{{ evpage.login | urlencode }}/page/{{ evpage.page_num - 1 }}/">← Newer</a>
{% endif %}

{# Next: page N+1, or nothing on last page #}
{% if evpage.page_num < evpage.total_pages %}
  <a href="/collectors/{{ evpage.login | urlencode }}/page/{{ evpage.page_num + 1 }}/">Older →</a>
{% endif %}
```

**Main page next-link** (in `collector-detail.njk`):

```nunjucks
{% if collector.total_event_pages > 1 %}
  <a href="/collectors/{{ collector.login | urlencode }}/page/2/">Older events →</a>
{% endif %}
```

### Pattern 2: Event Export Query Shape

**What:** Single DuckDB query producing all event rows per collector, sorted reverse-chron, with species slug resolved at export time.

**The core event query (to be parameterized per-collector or run as full batch):**

```sql
-- Source: mirrors data/feeds.py join pattern [VERIFIED: codebase]
-- Read from ASSETS_DIR/occurrences.parquet (not dbt sandbox — Pitfall 5)

WITH collector_specimens AS (
    SELECT ecdysis_id, date, record_type, canonical_name
    FROM read_parquet(?) -- occurrences.parquet path
    WHERE collector_inat_login = ?
      AND (ecdysis_id IS NOT NULL OR record_type = 'waba_specimen')
),
collected_events AS (
    SELECT
        'Collected'                                            AS event_type,
        cs.date                                               AS collected_date,
        cs.canonical_name                                     AS species_name,
        sp.slug                                               AS species_slug,
        NULL::VARCHAR                                         AS determiner,
        NULL::VARCHAR                                         AS date_identified,
        NULL::BOOLEAN                                         AS is_current,
        TRY_CAST(cs.date || 'T00:00:00+00:00' AS TIMESTAMPTZ) AS sort_ts
    FROM collector_specimens cs
    LEFT JOIN read_parquet(?) sp  -- species.parquet from ASSETS_DIR
        ON lower(sp.canonical_name) = lower(cs.canonical_name)
),
identified_events AS (
    SELECT
        'Identified'                                          AS event_type,
        NULL::VARCHAR                                         AS collected_date,
        NULLIF(i.scientific_name, '')                         AS species_name,
        sp.slug                                               AS species_slug,
        NULLIF(i.identified_by, '')                           AS determiner,
        NULLIF(i.date_identified, '')                         AS date_identified,
        (i.identification_is_current = '1')                   AS is_current,
        i.modified                                            AS sort_ts
    FROM collector_specimens cs
    JOIN ecdysis_data.identifications i
        ON i.coreid = CAST(cs.ecdysis_id AS VARCHAR)
    LEFT JOIN read_parquet(?) sp  -- species.parquet from ASSETS_DIR
        ON lower(sp.canonical_name) = lower(i.scientific_name)
    WHERE cs.ecdysis_id IS NOT NULL
      AND i.scientific_name IS NOT NULL
      AND i.scientific_name != ''  -- exclude blank determination rows
)
SELECT * FROM collected_events
UNION ALL
SELECT * FROM identified_events
ORDER BY sort_ts DESC NULLS LAST
```

**Output per event row:**
```
event_type     : 'Collected' | 'Identified'
collected_date : 'YYYY-MM-DD' | null     (used for display on Collected events)
species_name   : str | null              (scientific_name or canonical_name)
species_slug   : 'Genus/epithet' | null  (null when name doesn't match species page)
determiner     : str | null              (identified_by; null for no-determiner rows)
date_identified: 'YYYY' | 'YYYY-MM-DD' | null  (display context on Identified events)
is_current     : bool | null             (true=current ID, false=superseded, null=Collected)
sort_ts        : TIMESTAMPTZ             (for export ordering; omit from final JSON or keep as ISO string)
```

### Pattern 3: Batch export (avoid N+1 queries)

Rather than one query per collector, run a single batch query across all WABA collectors, then group results in Python:

```python
# Single DuckDB pass over all collectors
rows = con.execute(BATCH_QUERY, [occ_path, sp_path]).fetchall()
events_by_login = {}
for row in rows:
    login = row[0]
    events_by_login.setdefault(login, []).append(row[1:])
# Then chunk per login as in Pattern 1
```

This mirrors the `feeds.py` approach and avoids one query per collector for 121 collectors.

### Anti-Patterns to Avoid

- **Reading `dbt/target/sandbox/species.parquet` for slug lookup.** The sandbox file does NOT have the `slug` column. Use `ASSETS_DIR/species.parquet` (the exported file written by `species_export.py`). [VERIFIED: queried both files in session]
- **Using `stg_ecdysis__identifications` view for the event export.** The view only projects `coreid, modified`. The feed needs `identified_by`, `scientific_name`, `date_identified`, `identification_is_current`. Read `ecdysis_data.identifications` directly, as `feeds.py` does. [VERIFIED: codebase]
- **Putting `collector_event_pages.json` into the `_data` JS as a sync readFileSync of a 24 MB file at every Eleventy hot-reload.** At 24 MB this will slow HMR. Consider: (a) lazy-load only in production build mode, or (b) accept the slowdown since sub-page pagination doesn't change during dev. The planner should note this tradeoff.
- **Nesting the event data under `_data/collector_events.js` as a completely separate data file.** Using the same `_data/collectors.js` for both `collectorsArray` and `collectorEventPages` is simpler and keeps the data cascade cleaner.
- **Filtering by `identification_is_current = '1'` only.** D-FEED-02 requires all determinations including superseded ones (`is_current = '0'`). Only filter out blank `scientific_name` rows.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Species page URL | Custom slug derivation | LEFT JOIN species.parquet on lower(canonical_name) = lower(scientific_name) | species_export.py already computes the authoritative slug; re-using it avoids drift |
| 2D pagination | Nested Eleventy templates | Pre-flatten (collector, page-chunk) descriptors in Python export | Eleventy has no native 2D pagination; flat array is the documented workaround |
| Re-determination arc | Snapshot diffing | `identification_is_current` flag + `modified` timestamp already present in source | The data already carries the full history; no diffing needed |
| Sort key normalization | Client-side sort | Pipeline-side `ORDER BY sort_ts DESC` | Static pages have no client JS; all ordering must be export-time |

---

## Key Research Findings (the six CONTEXT questions answered)

### Q1: Eleventy 2D Pagination Mechanism — ANSWERED

**Eleventy 3.1.6** (confirmed in `node_modules/@11ty/eleventy/package.json`) uses `lodash.chunk` internally for pagination. There is no native 2D pagination feature. [VERIFIED: read Pagination.js source]

**Recommended mechanism:** Pre-flatten `(collector, page-index, eventChunk)` descriptors in the Python export.

- `collectors.json`: each collector record gains `first_page_events: [...]`, `total_event_pages: N`, `total_event_count: N`.
- `collector_event_pages.json`: flat array of `{login, page_num, total_pages, events: [...]}` for pages 2+.
- `_pages/collector-detail.njk` (existing): unchanged pagination (`collectorsArray`, size:1); template extended to render `collector.first_page_events` and a "Older →" link when `total_event_pages > 1`.
- `_pages/collector-events-page.njk` (new): paginates `collectors.collectorEventPages` with `size:1`; permalink `/collectors/{{ evpage.login | urlencode }}/page/{{ evpage.page_num }}/index.html`.

**Prev/next navigation:** Computable from `page_num` and `total_pages` in the template — no additional data needed. See Pattern 1 above.

**Zero client JS:** Confirmed. Eleventy generates all sub-pages at build time. No JavaScript is needed for pagination.

### Q2: Event-data sizing & file location — ANSWERED

[VERIFIED: queried live data/beeatlas.duckdb + dbt sandbox parquet]

| Metric | Value |
|--------|-------|
| Total events (all WABA collectors) | 123,977 |
| Max events per collector | 14,933 (swisschick) |
| Collectors with sub-pages at 100/page | 90 of 121 |
| Sub-pages at 100/page | 1,186 |
| Sub-pages at 50/page | 2,419 |
| Estimated `collector_event_pages.json` (100/page) | ~24 MB (build artifact) |
| Estimated `collectors.json` first-page events added | ~2.5 MB (Eleventy read at build) |

**Recommended chunk size: 100 events/page.** Rationale: halves sub-page count vs 50 (1,186 vs 2,419 pages to generate), keeps each page readable on mobile, reduces `collector_event_pages.json` size by ~6 MB.

**Recommended file layout:**
- `collectors.json` — existing file extended with first-page events and pagination metadata.
- `collector_event_pages.json` — new file in `public/data/` for sub-pages. ~24 MB build artifact; Eleventy reads it at build time, the SPA never fetches it.

**HMR note:** `_data/collectors.js` loads `collector_event_pages.json` synchronously. At 24 MB this adds ~100-200 ms to Eleventy hot-reload. Acceptable for a build artifact that changes only on nightly pipeline runs. The planner may choose to skip loading this file in `npm run dev` mode via an env guard if HMR latency becomes a problem.

### Q3: Modified timestamps on superseded rows — VERIFIED CORRECT

[VERIFIED: queried live ecdysis_data.identifications]

Superseded identification rows (`identification_is_current='0'`) preserve their **original** `modified` timestamp. They do not get bumped when a newer determination supersedes them.

**Confirmed example (coreid 5604643, Karen Wright):**
- 2025-02-17: "undetermined" (superseded, `is_current='0'`)
- 2025-08-18: "Heriades occidentalis" (superseded, `is_current='0'`)
- 2025-10-06 08:27: "Heriades" / coarser re-ID (superseded, `is_current='0'`)
- 2025-10-06 09:48: "Heriades carinata" (current, `is_current='1'`)

The timestamps spread across 8 months and read as a genuine refinement arc: undetermined → genus → species → re-determined. D-FEED-02's "learning arc" reads correctly.

**Practical implication for blank rows:** 10,804 blank rows (empty `scientific_name`) are almost all superseded (`is_current='0'`). Filter these out: `WHERE i.scientific_name IS NOT NULL AND i.scientific_name != ''`. This removes noise without losing any meaningful determination. Rows with a species name but no `identified_by` (15,483 rows) are kept — D-CARD-01 handles them with the blank-determiner fallback.

### Q4: Ecdysis identifications join + collector gating — VERIFIED

[VERIFIED: queried live data + read feeds.py + read stg_ecdysis__identifications.sql]

**Join path:**
1. Read `ASSETS_DIR/occurrences.parquet` (the pipeline-exported file, not dbt sandbox — follows Pitfall 5 from collectors_export.py).
2. Join `ecdysis_data.identifications i ON i.coreid = CAST(o.ecdysis_id AS VARCHAR)`. `ecdysis_id` is INTEGER in parquet; `coreid` is VARCHAR in identifications. The CAST is load-bearing (confirmed in feeds.py and verified against live data).
3. Gate by collector: `WHERE o.collector_inat_login IS NOT NULL AND (o.ecdysis_id IS NOT NULL OR o.record_type = 'waba_specimen')`.
4. Do NOT use `stg_ecdysis__identifications` view — it only projects `coreid, modified`. Read `ecdysis_data.identifications` directly (same as `feeds.py`).

**Additional columns needed from identifications** (not in staging view):
- `identified_by` (D-CARD-01 determiner name)
- `scientific_name` (D-CARD-02 species name)
- `date_identified` (display context alongside modified-derived position)
- `identification_is_current` (for D-FEED-02 full history; also useful for "Re-identified" label decision)

**waba_specimen rows (D-EVENT-02):** These have `ecdysis_id IS NULL`, so they produce only a Collected event. Their `canonical_name` may show as species context. All 33 waba_specimen rows in the collector gate have full `YYYY-MM-DD` dates and canonical_names that resolve to species slugs.

### Q5: Species → /taxa page link — VERIFIED

[VERIFIED: queried public/data/species.parquet + data/dbt/target/sandbox/species.parquet]

**URL format:** `/species/{Genus}/{specific_epithet}/` where slug = `{Genus}/{specific_epithet}` (capital genus, lowercase epithet, e.g. `Agapostemon/femoratus`).

**Slug source:** `public/data/species.parquet` (the `species_export.py`-written file with the `slug` column). The dbt sandbox parquet does NOT have this column. The event export must read from `ASSETS_DIR/species.parquet`.

**Join:** `lower(sp.canonical_name) = lower(i.scientific_name)` using a `LEFT JOIN`. The `canonical_name` in species.parquet is lowercase; `scientific_name` in identifications is mixed-case. The `lower()` normalization on both sides is necessary.

**Match rates against all identification rows (84,908 total):**

| Status | Count | Notes |
|--------|-------|-------|
| Has species slug | 27,885 (33%) | Direct link to /species/ page |
| No slug (unmatched) | 57,023 (67%) | Includes "undetermined" (43k), genus-only, higher ranks |

**Practical impact in the collector-gated dataset (80,619 identification rows):**
- 55,484 have both non-blank scientific_name AND a matching species slug → linkable
- ~15,000 have a non-blank scientific_name but no matching slug → text display
- ~10,000 have blank scientific_name → filtered out

**Fallback:** When `species_slug IS NULL`, render `species_name` as plain text (no `<a>` tag). This is the correct behavior for genus-only IDs like "Lasioglossum" or "Heriades" which may appear mid-arc before a species determination.

### Q6: Sort key normalization — VERIFIED

[VERIFIED: queried live data]

**Collected events:** All collected events (ecdysis + waba_specimen) have full `YYYY-MM-DD` dates (length 10 confirmed across all 43,358 collected event rows). No partial-date handling needed.

**Sort key:** `TRY_CAST(o.date || 'T00:00:00+00:00' AS TIMESTAMPTZ)` for Collected events. This places them at midnight UTC on their collection day. Identified events use `i.modified` directly (already a TIMESTAMPTZ).

**Within-day tiebreak:** If an Identified event has a `modified` timestamp on the same calendar day as a Collected event, the Identified event will naturally sort higher (its timestamp has a time component after midnight). This is semantically correct: identifications happen after collection.

**Within-batch tiebreak (same `modified` second):** Some batches of identifications share an identical `modified` timestamp (e.g., many specimens identified in one edit session have the same modified time to the second). Secondary sort within a second is by `scientific_name ASC` or `ecdysis_id ASC` — either gives deterministic ordering. The planner should pick one.

**Sort key to serialize to JSON:** The `sort_ts` TIMESTAMPTZ should be serialized as an ISO 8601 string. The template does not need to use it for display (only for the order the events arrive in the JSON array). The export should sort rows in Python/DuckDB and emit them in order; the JSON array ordering IS the display order.

---

## Common Pitfalls

### Pitfall 1: Wrong parquet path for species slug lookup
**What goes wrong:** Import from `data/dbt/target/sandbox/species.parquet` instead of `public/data/species.parquet`. The sandbox file has no `slug` column; the query silently fails or errors.
**Why it happens:** `collectors_export.py` reads from `ASSETS_DIR` (public/data/), but the pattern comment "reads from ASSETS_DIR + species.parquet" might be misread as sandbox.
**How to avoid:** Use `ASSETS_DIR / 'species.parquet'` consistently. The export runs AFTER `species-export` in `run.py` STEPS, so `ASSETS_DIR/species.parquet` is guaranteed to exist.
**Warning signs:** `BinderException: Referenced column "slug" not found` — means the sandbox parquet was used.

### Pitfall 2: Missing blank-row filter on identifications
**What goes wrong:** Including blank identification rows (`scientific_name = ''`) in the feed. These are 10,804 rows (~13% of all IDs), all with empty name and most with empty identified_by.
**Why it happens:** D-FEED-02 says "retain full history" but doesn't explicitly mention blank rows.
**How to avoid:** Add `WHERE i.scientific_name IS NOT NULL AND i.scientific_name != ''` to the identifications filter.
**Warning signs:** Events appearing in the feed with empty species names and blank determiners.

### Pitfall 3: CAST(ecdysis_id AS VARCHAR) omitted
**What goes wrong:** Joining `i.coreid = o.ecdysis_id` without the CAST. `ecdysis_id` is INTEGER in the parquet; `coreid` is VARCHAR. Without CAST the join produces zero rows silently in DuckDB.
**Why it happens:** The column types look compatible in English but differ at the DuckDB level.
**How to avoid:** Mirror `feeds.py` exactly: `i.coreid = CAST(o.ecdysis_id AS VARCHAR)`.
**Warning signs:** Zero Identified events exported for any collector despite having ecdysis records.

### Pitfall 4: Reading the staging view instead of raw identifications table
**What goes wrong:** Using `{{ source('ecdysis_data', 'identifications') }}` or `stg_ecdysis__identifications` in a dbt context, or attempting to join to a dbt mart that carries id data. The staging view only has `coreid` and `modified`.
**Why it happens:** `stg_ecdysis__identifications.sql` exists, making it seem like the right abstraction.
**How to avoid:** Read `ecdysis_data.identifications` directly (the DuckDB schema), same as `feeds.py` does with `FROM ecdysis_data.identifications i`.
**Warning signs:** Only `coreid` and `modified` available; no `identified_by`, `scientific_name`, etc.

### Pitfall 5: Attempting browser-side grouping or sorting
**What goes wrong:** Planning a client-side script that sorts or groups events for display.
**Why it happens:** Phase 171 adds a "UI hint: yes" flag; might tempt adding JS.
**How to avoid:** The collector page is JS-free (D-PAGE-01 / CONTEXT invariant / Phase 172 criterion 5). All grouping, sorting, and chunking happens in the Python export. The template renders a pre-sorted array in document order.
**Warning signs:** Any `<script>` tag added to collector-events-page.njk or collector-detail.njk for event display.

### Pitfall 6: `collector_event_pages.json` loaded for hot-reload in dev
**What goes wrong:** At 24 MB, loading this file on every Eleventy HMR cycle adds ~150-200 ms latency.
**Why it happens:** `_data/collectors.js` runs synchronously on every hot-reload; both collectors.json (~2.5 MB) and collector_event_pages.json (~24 MB) are re-read.
**How to avoid:** Accept the slowdown (the file only changes on nightly runs, not during development). Or add a dev-mode guard: `if (process.env.ELEVENTY_ENV === 'production') { load collector_event_pages } else { return [] }`. The planner should decide.
**Warning signs:** Eleventy hot-reload noticeably slower after adding the collector_event_pages load.

---

## Code Examples

### Verified join pattern from feeds.py

```python
# Source: data/feeds.py lines 45-46 [VERIFIED: codebase read]
# The canonical join shape for ecdysis identifications
FROM ecdysis_data.identifications i
JOIN ecdysis_data.occurrences o ON i.coreid = CAST(o.id AS VARCHAR)
```

For the event export, `o.id` in `ecdysis_data.occurrences` corresponds to `ecdysis_id` in the mart parquet. The pattern is: `i.coreid = CAST(o.ecdysis_id AS VARCHAR)` where `o` is `read_parquet(occurrences.parquet)`.

### Slug construction in species_export.py

```python
# Source: data/species_export.py lines 227-233 [VERIFIED: codebase read]
genus = r.get('genus') or ''
epithet = r.get('specific_epithet') or ''
if genus and epithet:
    r['slug'] = f"{genus}/{epithet}"   # e.g. 'Agapostemon/femoratus'
else:
    r['slug'] = genus if genus else slugify(r['scientificName'])
```

The taxa page URL is `/species/{slug}/`. The export joins identifications to `public/data/species.parquet` to resolve the slug at export time; slug is not re-computed per event.

### Eleventy sub-page permalink pattern

```yaml
# Source: pattern inferred from _pages/collector-detail.njk [VERIFIED: codebase read]
pagination:
  data: collectors.collectorEventPages
  size: 1
  alias: evpage
permalink: "/collectors/{{ evpage.login | urlencode }}/page/{{ evpage.page_num }}/index.html"
```

This is the exact mirror of the `collector-detail.njk` `size:1` pattern extended to a pre-flattened sub-page array.

### Vitest test extension for collectorEventPages

```typescript
// Source: pattern from src/tests/data-collectors.test.ts [VERIFIED: codebase read]
test('default export has a collectorEventPages property that is an Array (STREAM-03)', () => {
  expect(Array.isArray((collectors as any).collectorEventPages)).toBe(true);
});

test('every collectorEventPages entry has required fields', () => {
  for (const page of (collectors as any).collectorEventPages) {
    expect(typeof page.login).toBe('string');
    expect(typeof page.page_num).toBe('number');
    expect(page.page_num).toBeGreaterThanOrEqual(2);
    expect(typeof page.total_pages).toBe('number');
    expect(Array.isArray(page.events)).toBe(true);
    expect(page.events.length).toBeGreaterThan(0);
  }
});

test('collectorEventPages.length is > 0 (STREAM-03 — confirms pagination fires)', () => {
  expect((collectors as any).collectorEventPages.length).toBeGreaterThan(0);
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `source` enum in mart | `record_type` + `tier` facets | Phase 170 (shipped) | Query must use `record_type = 'waba_specimen'` not `source = 'waba_specimen'` |
| `public/data/collectors.json` has no events | Extended with `first_page_events` + pagination metadata | Phase 171 (this phase) | Eleventy data loader must handle larger file |
| `stg_ecdysis__identifications` (coreid + modified only) | Not changed — event export bypasses staging and reads raw `ecdysis_data.identifications` | — | No change to staging view needed |

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (existing) |
| Config file | `vitest.config.ts` (existing) |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| STREAM-01 | collectors.collectorsArray entries have `first_page_events` array | unit | `npm test -- data-collectors` | ✅ extend existing |
| STREAM-01 | first_page_events items have required shape (event_type, species_name, sort_ts, etc.) | unit | `npm test -- data-collectors` | ❌ Wave 0 |
| STREAM-01 | collector-detail.njk and collector-events-page.njk render in scaffold-check | smoke | `npm test -- page-scaffold` | ✅ existing — must add new templates |
| STREAM-02 | waba_specimen rows appear as Collected events in first_page_events or collectorEventPages | unit | `npm test -- data-collectors` | ❌ Wave 0 |
| STREAM-03 | collectorEventPages is an Array with length > 0 | unit | `npm test -- data-collectors` | ❌ Wave 0 |
| STREAM-03 | every collectorEventPages entry has login, page_num ≥ 2, total_pages, events | unit | `npm test -- data-collectors` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test`
- **Per wave merge:** `npm test`
- **Phase gate:** Full `npm test` green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/tests/data-collectors.test.ts` — extend with STREAM-01/02/03 assertions above
- [ ] `public/data/collector_event_pages.json` — must exist (generated by new export step) for tests to pass; run `cd data && uv run python collectors_events_export.py` in Wave 0

---

## Security Domain

Not applicable. This phase adds pre-computed static HTML pages from public iNaturalist data. No authentication, no user input, no server runtime. No ASVS categories apply.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| DuckDB | collectors_events_export.py | ✓ | (project) | — |
| data/beeatlas.duckdb | event export | ✓ | live | — |
| public/data/species.parquet | species slug resolution | ✓ | confirmed | — |
| data/dbt/target/sandbox/occurrences.parquet | event export | ✓ | confirmed | — |
| Eleventy 3.1.6 | template pagination | ✓ | 3.1.6 | — |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `collector_event_pages.json` at ~24 MB does not cause Eleventy build failures or OOM | Q2 / Pitfall 6 | Build time spikes; may need chunk size increase to reduce file size |
| A2 | `evpage.page_num - 1` arithmetic works in Nunjucks `{{ }}` expressions | Pattern 1 (prev/next) | Would require pre-computing prev/next URLs in the export instead of template |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed.

A2 note: Nunjucks does support integer arithmetic in `{{ }}` expressions, but the project has not used it in existing templates. The planner may prefer to pre-compute `prev_url` and `next_url` in the Python export to avoid any Nunjucks arithmetic.

---

## Open Questions

1. **Dev-mode HMR latency with 24 MB `collector_event_pages.json`**
   - What we know: `_data/collectors.js` runs synchronously on every hot-reload
   - What's unclear: Whether 150-200 ms slowdown is acceptable for `npm run dev` sessions
   - Recommendation: Add a dev-mode guard (`process.env.NODE_ENV !== 'production'` → return empty array for collectorEventPages) so sub-page links are broken in dev but HMR stays fast. Sub-pages are not needed for day-to-day development of the event card UI.

2. **Within-second sort tiebreak for batched identifications**
   - What we know: Large batches of identifications share identical `modified` timestamps (e.g. many specimens IDed in one session)
   - What's unclear: Which secondary sort gives the most useful ordering
   - Recommendation: Secondary sort by `CAST(o.ecdysis_id AS INTEGER) ASC` — gives consistent deterministic ordering by specimen accession order within a batch.

3. **"Re-identified" vs "Identified" label for superseded rows**
   - What we know: D-FEED-02 requires all determinations including superseded; CONTEXT leaves labeling to Claude's discretion
   - What's unclear: Which is more useful — uniform "Identified" for all, or "Re-identified" for `is_current='0'` rows?
   - Recommendation: Use "Identified" for the current determination (`is_current='1'`) and "Re-identified" for superseded ones (`is_current='0'`). But this is cosmetic and the export must carry `is_current` in the event JSON regardless.

---

## Sources

### Primary (HIGH confidence)
- `data/feeds.py` (codebase) — identifications join pattern; `modified`-as-availability precedent
- `data/collectors_export.py` (codebase) — existing export structure; Pitfall 5 (ASSETS_DIR vs sandbox)
- `data/dbt/models/staging/stg_ecdysis__identifications.sql` (codebase) — confirmed narrow projection; bypass needed
- `_pages/collector-detail.njk` (codebase) — existing pagination front matter
- `_data/collectors.js` (codebase) — existing loader pattern
- `data/domain.py` + `data/species_export.py` (codebase) — slug construction
- `node_modules/@11ty/eleventy/src/Plugins/Pagination.js` (codebase) — confirmed Eleventy 3.1.6 uses lodash.chunk; no 2D support
- Live `data/beeatlas.duckdb` queries (this session) — all numeric claims

### Secondary (MEDIUM confidence)
- Eleventy 3.x pagination documentation pattern (inferred from source code + existing project templates)

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all tools confirmed in codebase
- Architecture: HIGH — mechanism verified against live data and Eleventy source
- Pitfalls: HIGH — all pitfalls verified by direct query against live data
- Event counts: HIGH — queried live dbt sandbox parquet + ecdysis_data.identifications

**Research date:** 2026-06-27
**Valid until:** 2026-09-27 (stable domain; 90 days)

---

## ⚠ ORCHESTRATOR CORRECTION (2026-06-27) — taxon link resolution is RANK-AWARE, not species-only

The "Q5 / ~33% resolve to /species/" finding above UNDERSTATES linkability. The
BeeAtlas site generates taxon pages at **every rank**, not just species:

- `_pages/species-detail.njk` → `/species/{slug}/` (species)
- `_pages/genus.njk` → `/species/{Genus}/` (e.g. `/species/Agapostemon/` EXISTS)
- `_pages/subgenus.njk` → `/species/{Genus}/{Subgenus}/`
- `_pages/tribe.njk` → `/species/tribe/{Tribe}/`, plus `subfamily.njk`
- Linkable name set = `public/data/species.json` (species, has `slug`) ∪
  `public/data/higher_taxa.json` (genus/subgenus/tribe/subfamily, keyed by rank+name).

**Corrected resolution of CURRENT determinations (45,558), measured against the full set:**
- 53% → species page (24,102)
- 42% → literally `undetermined` / blank (18,914) — CORRECTLY no link
- ~6% → real misses (2,529): non-bee bycatch (`Diptera` → text, correct) +
  **subspecies trinomials** (`Eucera frater frater` misses because species.json
  keys on the binomial `Eucera frater` — STRIP the infraspecific epithet to link).

**`specific_epithet` and `taxon_rank` columns in `ecdysis_data.identifications`
are SPARSE/unreliable** — do NOT infer rank from them. Use `scientific_name`
(authoritative string) + the `genus` column. Genus-only determinations carry the
bare genus in the `genus` column (often with blank scientific_name); they appear
mostly in the SUPERSEDED re-ID history (D-FEED-02) and SHOULD link to the genus page.

**Planner: implement D-CARD-02 link resolution RANK-AWARE:**
1. binomial `scientific_name` matches species.json (lower(canonical_name)) → `/species/{slug}/`
2. else strip a 3rd token (subspecies) and retry species match
3. else `genus` column matches a genus page → `/species/{Genus}/`
4. else (undetermined / non-bee / not-in-atlas) → render species name as plain text, no link
Apply the Phase 123 `texanus→subtilior` synonym so clean species names don't miss.
Expect a HIGH link rate on real determinations — the earlier 20–33% figures were
measurement artifacts (species-only match + trusting the sparse specific_epithet column).

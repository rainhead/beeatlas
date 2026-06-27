# Phase 171: Per-Collector Event Stream - Pattern Map

**Mapped:** 2026-06-27
**Files analyzed:** 8 new/modified files
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `data/collectors_events_export.py` | service/export | batch + transform | `data/collectors_export.py` (structure), `data/feeds.py` (identifications join) | exact (composite) |
| `data/run.py` | config | batch | `data/run.py` itself — add one STEPS entry | exact |
| `public/data/collectors.json` | artifact | — | existing file extended in-place | exact |
| `public/data/collector_event_pages.json` | artifact | — | `public/data/collectors.json` (same write pattern) | role-match |
| `_data/collectors.js` | provider/loader | request-response | `_data/collectors.js` itself — add second export | exact |
| `_pages/collector-events-page.njk` | template | request-response | `_pages/collector-detail.njk` (size:1 pagination) | exact |
| `_pages/collector-detail.njk` | template | request-response | itself — extend to render `first_page_events` | exact |
| `src/styles/places.css` | config/style | — | itself — append new CSS block | exact |
| `src/tests/data-collectors.test.ts` | test | — | `src/tests/data-collectors.test.ts` + `src/tests/data-places.test.ts` | exact |

---

## Pattern Assignments

### `data/collectors_events_export.py` (export, batch+transform)

**Analog A — file structure:** `data/collectors_export.py`

**Module header / DB_PATH / ASSETS_DIR pattern** (lines 1–28):
```python
"""Export per-collector event feed for the frontend (STREAM-01/02/03).

Writes:
  ASSETS_DIR/collectors.json     — extended: + first_page_events, total_event_pages, total_event_count
  ASSETS_DIR/collector_event_pages.json  — flat sub-page descriptor array for pages 2+

Runs AFTER collectors-export because it reads the collectors.json written by that step
and rewrites it with event fields appended.

Usage:
    cd data && uv run python collectors_events_export.py
"""

import json
import os
from pathlib import Path

import duckdb

DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "beeatlas.duckdb"))
_default_assets = str(Path(__file__).parent.parent / "public" / "data")
ASSETS_DIR = Path(os.environ.get("EXPORT_DIR", _default_assets))
```

**Analog B — identifications join:** `data/feeds.py` lines 36–51

The canonical join shape for `ecdysis_data.identifications`. Mirror exactly:
```python
_QUERY = """
    SELECT ...
    FROM ecdysis_data.identifications i
    JOIN ecdysis_data.occurrences o ON i.coreid = CAST(o.id AS VARCHAR)
    ...
"""
```

For the event export, `o.id` in `ecdysis_data.occurrences` maps to `ecdysis_id` in the mart parquet. The new export reads `read_parquet(occurrences.parquet)` instead of `ecdysis_data.occurrences`, so the join becomes:
```sql
JOIN ecdysis_data.identifications i ON i.coreid = CAST(o.ecdysis_id AS VARCHAR)
```
The CAST is load-bearing: `ecdysis_id` is INTEGER in parquet, `coreid` is VARCHAR. Omitting CAST produces zero rows silently.

**Collector gate pattern** (`collectors_export.py` lines 65–69):
```python
WHERE o.collector_inat_login IS NOT NULL
  AND (o.ecdysis_id IS NOT NULL OR o.record_type IN ('waba_specimen', 'provisional_sample'))
```
For events, use `record_type IN ('ecdysis', 'waba_specimen')` (samples are excluded per 168 / D-EMPTY).

**FileNotFoundError guard** (`collectors_export.py` lines 99–109):
```python
occ_parquet = ASSETS_DIR / "occurrences.parquet"
species_parquet = ASSETS_DIR / "species.parquet"

if not occ_parquet.exists():
    raise FileNotFoundError(
        f"{occ_parquet} not found — run dbt before collectors-export"
    )
if not species_parquet.exists():
    raise FileNotFoundError(
        f"{species_parquet} not found — run species-export before collectors-export"
    )
```
Same guard applies to the events export. Species parquet must be `ASSETS_DIR/species.parquet` — NOT `dbt/target/sandbox/species.parquet` (sandbox lacks the `slug` column).

**Step wrapper pattern** (`collectors_export.py` lines 147–157):
```python
def export_collectors_events_step() -> None:
    """Zero-argument wrapper for inclusion in run.py STEPS list."""
    con = duckdb.connect(DB_PATH)
    try:
        export_collector_events(con)
    finally:
        con.close()


if __name__ == "__main__":
    export_collectors_events_step()
```

**JSON write pattern** (`collectors_export.py` lines 136–141):
```python
out_path = ASSETS_DIR / "collector_event_pages.json"
out_path.write_text(json.dumps(sub_page_descriptors), encoding="utf-8")
print(  # noqa: T201
    f"  collector_event_pages.json: {len(sub_page_descriptors):,} pages, "
    f"{out_path.stat().st_size:,} bytes"
)
```
Use `json.dumps(records, indent=2)` for `collectors.json` (human-readable, already indented); use `json.dumps(sub_page_descriptors)` (compact, no indent) for `collector_event_pages.json` to reduce the ~24 MB file size.

**Feeds.py batch pattern** (`feeds.py` lines 245–290): enumerates all collectors in one pass, then loops per value. Mirror with a single DuckDB query returning all WABA collectors' events, grouped in Python by login. Avoids N+1 queries for 121 collectors.

**Full event query shape** (from RESEARCH.md Pattern 2 — verified against live data):
```sql
WITH collector_specimens AS (
    SELECT ecdysis_id, date, record_type, canonical_name, collector_inat_login
    FROM read_parquet(?)  -- ASSETS_DIR/occurrences.parquet
    WHERE collector_inat_login IS NOT NULL
      AND (ecdysis_id IS NOT NULL OR record_type = 'waba_specimen')
),
collected_events AS (
    SELECT
        cs.collector_inat_login                                        AS login,
        'Collected'                                                    AS event_type,
        cs.date                                                        AS event_date,
        cs.canonical_name                                              AS species_name,
        sp.slug                                                        AS species_slug,
        NULL::VARCHAR                                                  AS determiner,
        NULL::VARCHAR                                                  AS date_identified,
        NULL::BOOLEAN                                                  AS is_current,
        (cs.record_type = 'waba_specimen' AND cs.ecdysis_id IS NULL)  AS is_pending,
        TRY_CAST(cs.date || 'T00:00:00+00:00' AS TIMESTAMPTZ)         AS sort_ts
    FROM collector_specimens cs
    LEFT JOIN read_parquet(?) sp  -- ASSETS_DIR/species.parquet
        ON lower(sp.canonical_name) = lower(cs.canonical_name)
),
identified_events AS (
    SELECT
        cs.collector_inat_login                                        AS login,
        'Identified'                                                   AS event_type,
        NULL::VARCHAR                                                  AS event_date,
        NULLIF(i.scientific_name, '')                                  AS species_name,
        sp.slug                                                        AS species_slug,
        NULLIF(i.identified_by, '')                                    AS determiner,
        NULLIF(i.date_identified, '')                                  AS date_identified,
        (i.identification_is_current = '1')                            AS is_current,
        false                                                          AS is_pending,
        i.modified                                                     AS sort_ts
    FROM collector_specimens cs
    JOIN ecdysis_data.identifications i
        ON i.coreid = CAST(cs.ecdysis_id AS VARCHAR)
    LEFT JOIN read_parquet(?) sp  -- ASSETS_DIR/species.parquet
        ON lower(sp.canonical_name) = lower(i.scientific_name)
    WHERE cs.ecdysis_id IS NOT NULL
      AND i.scientific_name IS NOT NULL
      AND i.scientific_name != ''
)
SELECT * FROM collected_events
UNION ALL
SELECT * FROM identified_events
ORDER BY login, sort_ts DESC NULLS LAST, CAST(ecdysis_id AS INTEGER) ASC
```

**Rank-aware slug resolution** (ORCHESTRATOR CORRECTION in RESEARCH.md): the LEFT JOIN on `lower(sp.canonical_name) = lower(i.scientific_name)` covers species. For genus-only and subspecies:
1. Species match via the LEFT JOIN above → `/species/{slug}/`
2. Subspecies: strip 3rd token and retry (implement in Python post-query using `species_name.split()`)
3. Genus-only: join to `higher_taxa.json` or use `i.genus` column to form `/species/{Genus}/`
4. Unresolved: `species_slug = None` → plain text in template

**2D pagination chunking** (RESEARCH.md Pattern 1):
```python
CHUNK_SIZE = 100

events_by_login = {}  # login -> [event_dict, ...]
for row in rows:
    login = row[0]
    events_by_login.setdefault(login, []).append(row_to_dict(row))

# Load existing collectors.json, extend, rewrite
collectors = json.loads((ASSETS_DIR / "collectors.json").read_text())
collector_map = {c["login"]: c for c in collectors}

sub_page_descriptors = []
for login, events in events_by_login.items():
    chunks = [events[i:i+CHUNK_SIZE] for i in range(0, len(events), CHUNK_SIZE)]
    total_pages = len(chunks)
    rec = collector_map.get(login, {})
    rec["first_page_events"] = chunks[0] if chunks else []
    rec["total_event_pages"] = total_pages
    rec["total_event_count"] = len(events)
    for page_num, chunk in enumerate(chunks[1:], start=2):
        sub_page_descriptors.append({
            "login": login,
            "page_num": page_num,
            "total_pages": total_pages,
            "events": chunk,
        })

# Collectors with no events get empty first_page_events
for rec in collectors:
    rec.setdefault("first_page_events", [])
    rec.setdefault("total_event_pages", 0)
    rec.setdefault("total_event_count", 0)
```

---

### `data/run.py` (config — STEPS entry)

**Analog:** `data/run.py` lines 48, 127–128

**Import pattern** (lines 48, 49):
```python
from collectors_export import export_collectors_step
from places_maps import main as generate_place_maps_step
```
Add after line 48:
```python
from collectors_events_export import export_collectors_events_step
```

**STEPS entry** (lines 127–129): insert after `collectors-export`, before `places-maps`:
```python
("collectors-export", export_collectors_step),
("collectors-events-export", export_collectors_events_step),   # NEW
("places-maps", generate_place_maps_step),
```

---

### `_data/collectors.js` (provider/loader — extended)

**Analog:** `_data/collectors.js` lines 1–23 (the whole file)

**Extended export** — add `collectorEventPages` alongside `collectorsArray`:
```js
// Build-time data feed for collector pages. Exposed as `collectors` global to Eleventy templates.
//
// Contract (PAGE-01, D-09, STREAM-03): exports { collectorsArray, collectorEventPages }.
// - collectorsArray: per-collector stats + first_page_events (extended Phase 171)
// - collectorEventPages: flat array of {login, page_num, total_pages, events} for pages 2+
//
// Pitfall #8: reads only .json files — no parquet, no columnar store — so HMR stays fast.
// NOTE: collector_event_pages.json is ~24 MB; in dev it adds ~150ms to HMR.
// Guarded by ELEVENTY_ENV check so dev sessions stay fast.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');

const collectorsArray = JSON.parse(
  readFileSync(join(repoRoot, 'public/data/collectors.json'), 'utf8')
);

// Skip loading the 24 MB sub-page file in dev (ELEVENTY_ENV !== 'production')
// so HMR stays sub-100ms. Sub-pages aren't needed for day-to-day event-card dev.
const collectorEventPages =
  process.env.ELEVENTY_ENV === 'production'
    ? JSON.parse(readFileSync(join(repoRoot, 'public/data/collector_event_pages.json'), 'utf8'))
    : [];

export default { collectorsArray, collectorEventPages };
```

---

### `_pages/collector-events-page.njk` (template — NEW)

**Analog:** `_pages/collector-detail.njk` lines 1–10 (front matter) + `_pages/place-detail.njk` (article structure)

**Front matter** — mirror `collector-detail.njk` with `collectorEventPages`, `size:1`:
```yaml
---
pagination:
  data: collectors.collectorEventPages
  size: 1
  alias: evpage
permalink: "/collectors/{{ evpage.login | urlencode }}/page/{{ evpage.page_num }}/index.html"
eleventyComputed:
  title: "{{ evpage.login }} — BeeAtlas (page {{ evpage.page_num }} of {{ evpage.total_pages }})"
layout: default.njk
---
```

**Article structure** — mirror `collector-detail.njk` lines 11–24 for the `<link>` and `<article>` wrapper:
```nunjucks
<link rel="stylesheet" href="/src/styles/places.css">
<article class="places-page place-detail">
  <h1>{{ evpage.login }}</h1>
  <section class="event-feed-section">
    <h2>Collection history</h2>
    <ol class="event-feed" reversed>
      {% for event in evpage.events %}
        {# ... event row markup per UI-SPEC component 2 ... #}
      {% endfor %}
    </ol>
    <nav class="event-pagination" aria-label="Event history pages">
      {# Prev link #}
      {% if evpage.page_num == 2 %}
        <a href="/collectors/{{ evpage.login | urlencode }}/">← Newer events</a>
      {% else %}
        <a href="/collectors/{{ evpage.login | urlencode }}/page/{{ evpage.page_num - 1 }}/">← Newer events</a>
      {% endif %}
      <span class="page-indicator">Page {{ evpage.page_num }} of {{ evpage.total_pages }}</span>
      {# Next link #}
      {% if evpage.page_num < evpage.total_pages %}
        <a href="/collectors/{{ evpage.login | urlencode }}/page/{{ evpage.page_num + 1 }}/">Older events →</a>
      {% endif %}
    </nav>
  </section>
</article>
```

**Event row macro** (per UI-SPEC component 2 — four variants):
```nunjucks
{# Collected — ecdysis or waba_specimen with known name #}
<li class="event-row{% if event.is_pending %} event-row--pending{% endif %}">
  <time class="event-date" datetime="{{ event.event_date }}">{{ event.event_date }}</time>
  <span class="event-type event-type--collected">Collected</span>
  <span class="event-taxon">
    {% if event.species_slug and not event.is_pending %}
      <a href="/species/{{ event.species_slug }}/">{{ event.species_name }}</a>
    {% else %}
      {{ event.species_name }}
    {% endif %}
  </span>
  {% if event.is_pending %}<span class="event-pending">awaiting ID</span>{% endif %}
</li>

{# Identified — current (is_current=true) #}
<li class="event-row">
  <time class="event-date" datetime="{{ event.event_date }}">{{ event.event_date }}</time>
  <span class="event-type event-type--identified">Identified</span>
  <span class="event-taxon">
    {% if event.species_slug %}<a href="/species/{{ event.species_slug }}/">{{ event.species_name }}</a>
    {% else %}{{ event.species_name }}{% endif %}
  </span>
  {% if event.determiner %}<span class="event-determiner">by {{ event.determiner }}</span>{% endif %}
</li>

{# Re-identified — superseded (is_current=false) #}
<li class="event-row event-row--reidentified">
  <time class="event-date" datetime="{{ event.event_date }}">{{ event.event_date }}</time>
  <span class="event-type event-type--reidentified">Re-identified</span>
  ...same taxon/determiner pattern...
</li>
```

The `event.event_date` field in the JSON is the DATE portion only (YYYY-MM-DD) derived from `sort_ts` at export time — the precise timestamp drives sort order but is truncated to date for display.

---

### `_pages/collector-detail.njk` (template — MODIFIED)

**Analog:** itself (lines 1–24, read above)

**Extension point:** append after line 23 (the `{%- endif -%}` closing the atlas link block), before line 24 (`</article>`):

```nunjucks
  {#- Phase 171: Event feed section -#}
  {%- if collector.total_event_count > 0 -%}
  <section class="event-feed-section">
    <h2>Collection history</h2>
    <ol class="event-feed" reversed>
      {% for event in collector.first_page_events %}
        {# ... same event row macro as collector-events-page.njk ... #}
      {% endfor %}
    </ol>
    {% if collector.total_event_pages > 1 %}
    <nav class="event-pagination" aria-label="Event history pages">
      <a href="/collectors/{{ collector.login | urlencode }}/page/2/">Older events →</a>
    </nav>
    {% endif %}
  </section>
  {%- else -%}
  <section class="event-feed-section">
    <h2>Collection history</h2>
    <p class="metadata">No specimen events recorded yet.</p>
  </section>
  {%- endif -%}
```

---

### `src/styles/places.css` (style — MODIFIED)

**Analog:** `src/styles/places.css` lines 1–50 (existing file — design tokens, `.places-list` list pattern)

**Extension:** append the complete CSS block from UI-SPEC §"CSS Additions" after the existing content. Key patterns to observe:

- Uses `var(--border, #ddd)`, `var(--text-muted, #666)`, `var(--accent, #2c7a2c)` — same CSS custom property references as the existing `.places-page .metadata` rule (line 19)
- `.event-feed` follows the same `list-style: none; margin: 0; padding: 0` as `.places-list` (lines 33–37)
- `.event-feed .event-row` row border `border-bottom: 1px solid var(--border, #ddd)` mirrors `.places-list li` (lines 39–44)
- Flexbox row layout with `gap: 0.5rem` mirrors `.places-list li` (line 41)

Full CSS block to append (verbatim from UI-SPEC):
```css
/* Phase 171: event feed */

.event-feed-section {
  margin-top: 1.5rem;
}

.event-feed {
  list-style: none;
  margin: 0;
  padding: 0;
}

.event-feed .event-row {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.5rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--border, #ddd);
}

.event-date {
  font-size: 0.85rem;
  color: var(--text-muted, #666);
  white-space: nowrap;
  flex: 0 0 auto;
  min-width: 6.5rem;
}

.event-type {
  font-size: 0.85rem;
  flex: 0 0 auto;
  white-space: nowrap;
}

.event-type--collected   { color: var(--text-body, #213547); }
.event-type--identified  { color: var(--accent, #2c7a2c); }
.event-type--reidentified { color: var(--text-muted, #666); }

.event-taxon {
  flex: 1 1 auto;
  min-width: 0;
}

.event-determiner {
  font-size: 0.85rem;
  color: var(--text-muted, #666);
  flex: 0 0 auto;
  white-space: nowrap;
}

.event-pending {
  font-size: 0.85rem;
  color: var(--text-muted, #666);
  font-style: italic;
  flex: 0 0 auto;
}

/* Phase 171: pagination nav */

.event-pagination {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem 0;
  font-size: 0.85rem;
}

.event-pagination .page-indicator {
  flex: 1;
  text-align: center;
  color: var(--text-muted, #666);
}

.event-pagination a {
  padding: 0.5rem 0;
}

.event-pagination a:focus-visible {
  outline: 2px solid var(--accent, #2c7a2c);
  outline-offset: 2px;
  border-radius: 2px;
}
```

---

### `src/tests/data-collectors.test.ts` (test — EXTENDED)

**Analog:** `src/tests/data-collectors.test.ts` lines 1–48 (existing file, read above)

**Extension:** add a second `describe` block after the existing one. Mirror the field-shape loop pattern from lines 20–33:

```typescript
describe('_data/collectors.js Phase 171 — event feed (STREAM-01/02/03)', () => {
  test('default export has a collectorEventPages property that is an Array (STREAM-03)', () => {
    expect(Array.isArray((collectors as any).collectorEventPages)).toBe(true);
  });

  test('collectorEventPages.length is > 0 (STREAM-03 — confirms pagination fires)', () => {
    // Will be 0 in dev (ELEVENTY_ENV guard); skip if env is not production
    if (process.env.ELEVENTY_ENV !== 'production') return;
    expect((collectors as any).collectorEventPages.length).toBeGreaterThan(0);
  });

  test('every collectorEventPages entry has required fields (STREAM-03)', () => {
    for (const page of (collectors as any).collectorEventPages) {
      expect(typeof page.login).toBe('string');
      expect(typeof page.page_num).toBe('number');
      expect(page.page_num).toBeGreaterThanOrEqual(2);
      expect(typeof page.total_pages).toBe('number');
      expect(Array.isArray(page.events)).toBe(true);
      expect(page.events.length).toBeGreaterThan(0);
    }
  });

  test('collectorsArray entries have first_page_events array (STREAM-01)', () => {
    for (const c of (collectors as any).collectorsArray) {
      expect(Array.isArray(c.first_page_events),
        `first_page_events of ${c.login}`).toBe(true);
      expect(typeof c.total_event_pages).toBe('number');
      expect(typeof c.total_event_count).toBe('number');
    }
  });

  test('first_page_events items have required event shape (STREAM-01)', () => {
    for (const c of (collectors as any).collectorsArray) {
      for (const ev of (c as any).first_page_events) {
        expect(['Collected', 'Identified']).toContain(ev.event_type);
        // species_name may be null for blank rows (filtered), but event_type must exist
        expect(typeof ev.event_type).toBe('string');
        // is_current: boolean for Identified, null for Collected
        if (ev.event_type === 'Identified') {
          expect(typeof ev.is_current).toBe('boolean');
        }
      }
    }
  });

  test('does NOT read parquet (Pitfall #8 — HMR)', () => {
    // Existing assertion covers the extended file too (already in describe block above)
    // Re-assert here for documentation clarity
    const src = readFileSync(resolve(ROOT, '_data/collectors.js'), 'utf-8');
    expect(src).not.toMatch(/parquet/i);
  });
});
```

---

## Shared Patterns

### DB_PATH + ASSETS_DIR env vars
**Source:** `data/collectors_export.py` lines 22–24, `data/feeds.py` lines 26–28
**Apply to:** `data/collectors_events_export.py`
```python
DB_PATH = os.environ.get("DB_PATH", str(Path(__file__).parent / "beeatlas.duckdb"))
_default_assets = str(Path(__file__).parent.parent / "public" / "data")
ASSETS_DIR = Path(os.environ.get("EXPORT_DIR", _default_assets))
```

### Parquet path guard (Pitfall 5 / anti-pattern)
**Source:** `data/collectors_export.py` lines 99–109
**Apply to:** `data/collectors_events_export.py`
Always `ASSETS_DIR / "species.parquet"`, never `dbt/target/sandbox/species.parquet`. The sandbox file has no `slug` column — the query silently produces NULL slugs for all events.

### CAST(ecdysis_id AS VARCHAR) join (Pitfall 3)
**Source:** `data/feeds.py` line 46
**Apply to:** `data/collectors_events_export.py` identifications join
```python
# feeds.py canonical form:
JOIN ecdysis_data.occurrences o ON i.coreid = CAST(o.id AS VARCHAR)
# Events export equivalent (joining to parquet not ecdysis_data.occurrences):
JOIN ecdysis_data.identifications i ON i.coreid = CAST(o.ecdysis_id AS VARCHAR)
```

### Zero-arg step wrapper for run.py
**Source:** `data/collectors_export.py` lines 147–157
**Apply to:** `data/collectors_events_export.py`
```python
def export_collectors_events_step() -> None:
    """Zero-argument wrapper for inclusion in run.py STEPS list."""
    con = duckdb.connect(DB_PATH)
    try:
        export_collector_events(con)
    finally:
        con.close()
```

### Eleventy data loader (no parquet — Pitfall #8)
**Source:** `_data/collectors.js` lines 13–22
**Apply to:** extended `_data/collectors.js`
The loader reads only `.json` files. The `does NOT read parquet` test in `data-collectors.test.ts` line 44 is a regression guard that will catch any accidental parquet import.

### `<link rel="stylesheet">` + `<article class="places-page">` wrapper
**Source:** `_pages/collector-detail.njk` lines 11–12
**Apply to:** `_pages/collector-events-page.njk`
```nunjucks
<link rel="stylesheet" href="/src/styles/places.css">
<article class="places-page place-detail">
```

### `# noqa: T201` on print statements
**Source:** `data/collectors_export.py` lines 138, 144; `data/feeds.py` lines 97, 126
**Apply to:** all `print(...)` calls in `data/collectors_events_export.py`

---

## No Analog Found

All files in scope have close analogs. No gaps.

---

## Metadata

**Analog search scope:** `data/`, `_data/`, `_pages/`, `src/tests/`, `src/styles/`
**Files scanned:** 9 source files read directly
**Pattern extraction date:** 2026-06-27

# Phase 113: Species Page Expansion — Pattern Map

**Mapped:** 2026-05-24
**Files analyzed:** 15
**Analogs found:** 15 / 15

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `data/dbt/models/intermediate/int_species_universe.sql` | transform | batch | `data/dbt/models/intermediate/int_species_occurrences_agg.sql` | exact (same list_value pattern) |
| `data/dbt/models/marts/species.sql` | transform | batch | self (add column to existing SELECT) | self-extend |
| `data/dbt/models/marts/schema.yml` | config | — | self (add row under species model) | self-extend |
| `data/species_maps.py` | utility | file-I/O | self (extend `_write_species_svg`, `_load_county_geojsons`, `generate_species_maps`) | self-extend |
| `data/species_export.py` | utility | file-I/O | self (extend `SPECIES_COLUMNS` list and PyArrow schema) | self-extend |
| `data/tests/test_species_maps.py` | test | — | self (new test functions in existing file) | self-extend |
| `_data/species.js` | utility | transform | self (extend genusList/subgenusList lambdas) | self-extend |
| `_pages/species.njk` | template | request-response | `_pages/genus.njk` (same `<span class="count">` slot pattern) | role-match |
| `_pages/species-detail.njk` | template | request-response | self (extend SVG condition, add attribution, hide atlas link) | self-extend |
| `_pages/genus.njk` | template | request-response | `_pages/subgenus.njk` | exact (identical species list loop) |
| `_pages/subgenus.njk` | template | request-response | `_pages/genus.njk` | exact (identical species list loop) |
| `src/species/seasonality-viz.ts` | component | event-driven | self (extend VIZ-02 fallback branch) | self-extend |
| `src/tests/seasonality-viz.test.ts` | test | — | self (new test in existing describe block) | self-extend |
| `src/tests/data-species.test.ts` | test | — | self (update count assertion, add new tests) | self-extend |
| `src/tests/build-output.test.ts` | test | — | self (add new test in existing describe block) | self-extend |

---

## Pattern Assignments

### `data/dbt/models/intermediate/int_species_universe.sql` (transform, batch)

**Analog:** `data/dbt/models/intermediate/int_species_occurrences_agg.sql`

**Core pattern — `list_value(SUM(CASE...))::INTEGER[12]`** (lines 25-38 of analog):
```sql
list_value(
    SUM(CASE WHEN TRY_CAST(month AS INT) =  1 THEN 1 ELSE 0 END),
    SUM(CASE WHEN TRY_CAST(month AS INT) =  2 THEN 1 ELSE 0 END),
    -- ... repeat for months 3-11 ...
    SUM(CASE WHEN TRY_CAST(month AS INT) = 12 THEN 1 ELSE 0 END)
)::INTEGER[12] AS checklist_month_histogram
```
This pattern (from `int_species_occurrences_agg.sql`) is replicated verbatim for the new `checklist_month_agg` CTE, reading from `{{ ref('checklist') }}` instead of `source('ecdysis_data', 'occurrences')`. Add `COUNT(*) AS checklist_count` in the same SELECT.

**NULL backfill pattern — CASE not COALESCE** (lines 48-53 of `int_species_universe.sql`):
```sql
-- DuckDB COALESCE on INTEGER[12] is unimplemented in 1.4.x. Use CASE.
CASE WHEN oa.month_histogram IS NULL
     THEN [0,0,0,0,0,0,0,0,0,0,0,0]::INTEGER[]
     ELSE oa.month_histogram
END AS month_histogram
```
The new merged histogram and the `checklist_count` backfill must use `CASE` in the same way.

**Element-wise merge pattern** (new, per research RESEARCH.md Pattern 1):
```sql
CASE WHEN oa.month_histogram IS NULL AND cma.checklist_month_histogram IS NULL
     THEN [0,0,0,0,0,0,0,0,0,0,0,0]::INTEGER[]
     WHEN oa.month_histogram IS NULL
     THEN cma.checklist_month_histogram
     WHEN cma.checklist_month_histogram IS NULL
     THEN oa.month_histogram
     ELSE list_value(
         oa.month_histogram[1] + cma.checklist_month_histogram[1],
         oa.month_histogram[2] + cma.checklist_month_histogram[2],
         -- ... all 12 elements ...
     )::INTEGER[12]
END AS month_histogram
```

**CTE structure** (lines 12-14, 27-65 of `int_species_universe.sql`) — add `checklist_month_agg` CTE alongside `occ_agg` and LEFT JOIN it into `species_universe`:
```sql
WITH occ_agg AS (
    SELECT * FROM {{ ref('int_species_occurrences_agg') }}
),
checklist_month_agg AS (
    SELECT
        canonical_name,
        list_value(...)::INTEGER[12] AS checklist_month_histogram
    FROM {{ ref('checklist') }}
    WHERE canonical_name IS NOT NULL
      AND month IS NOT NULL   -- ~15% of rows have NULL month per D-11; skip for histogram only
    GROUP BY canonical_name
),
-- Separate CTE for total count — must NOT filter by month IS NOT NULL to capture all records
checklist_count_agg AS (
    SELECT canonical_name, COUNT(*) AS checklist_count
    FROM {{ ref('checklist') }}
    WHERE canonical_name IS NOT NULL
    GROUP BY canonical_name
),
-- ... existing provisional_agg, geo_agg CTEs ...
species_universe AS (
    SELECT
        -- ... existing columns ...
        COALESCE(cma.checklist_count, 0) AS checklist_count,
        -- merged month_histogram replaces existing CASE block
    FROM {{ ref('stg_checklist__species') }} c
    FULL OUTER JOIN occ_agg oa ON ...
    LEFT JOIN checklist_month_agg cma
        ON cma.canonical_name = COALESCE(c.canonical_name, oa.canonical_name)
    -- ... existing LEFT JOINs ...
)
```

---

### `data/dbt/models/marts/species.sql` (transform, batch)

**Analog:** self (lines 15-34)

**Core pattern — add column to SELECT** (lines 15-34):
```sql
SELECT
    scientificName,
    -- ... all 18 existing columns ...
    ecoregion_count,
    checklist_count         -- NEW: add after ecoregion_count
FROM {{ ref('int_species_universe') }}
```
The SELECT order must match `schema.yml` contract column order.

---

### `data/dbt/models/marts/schema.yml` (config)

**Analog:** self (lines 72-112, the `species` model block)

**Core pattern — enforced contract column entry** (lines 109-112, last two entries as example):
```yaml
      - name: county_count
        data_type: bigint
      - name: ecoregion_count
        data_type: bigint
      - name: checklist_count     # NEW: add after ecoregion_count
        data_type: bigint
```
`data_type: bigint` matches the `COALESCE(cma.checklist_count, 0)` which produces a BIGINT via COUNT(*).

---

### `data/species_maps.py` (utility, file-I/O)

**Analog:** self

**STYLE_CSS extension** (lines 52-55, current):
```python
STYLE_CSS = (
    ".county { fill: #f4f4f0; stroke: #888; stroke-width: 0.5; }\n"
    ".checklist-county { fill: #b0cfe8; fill-opacity: 0.5; stroke: #888; stroke-width: 0.5; }\n"  # NEW
    ".occ { fill: #c44; fill-opacity: 0.6; stroke: none; }"
)
```

**`_load_county_geojsons` signature change** (lines 79-96, current returns `list[dict]`):
```python
def _load_county_geojsons(con: duckdb.DuckDBPyConnection) -> dict[str, dict]:
    """Return county_name -> GeoJSON dict mapping for WA counties."""
    rows = con.execute(
        """
        SELECT name,
               ST_AsGeoJSON(ST_SimplifyPreserveTopology(geom, 0.005))
        FROM geographies.us_counties
        WHERE state_fips = ?
        """,
        [STATE_FIPS],
    ).fetchall()
    return {name: json.loads(g) for name, g in rows}
```
`_build_county_backdrop` must be updated to iterate `county_geojsons.values()` instead of the list directly.

**`_write_species_svg` signature extension** (lines 162-167, current signature):
```python
def _write_species_svg(
    slug: str,
    points: list[tuple[float, float]],
    checklist_counties: set[str],           # NEW
    county_geojsons_by_name: dict[str, dict],  # NEW (the full named dict)
    backdrop: ET.Element,
    out_dir: Path,
) -> int:
    root = copy.deepcopy(backdrop)
    # 1. Checklist county fills BEFORE occurrence dots (SVG render order)
    for county_name, geom in county_geojsons_by_name.items():
        if county_name not in checklist_counties:
            continue
        gtype = geom.get("type")
        if gtype == "Polygon":
            d = " ".join(_ring_to_path(ring) for ring in geom["coordinates"])
        elif gtype == "MultiPolygon":
            d = " ".join(
                _ring_to_path(ring)
                for poly in geom["coordinates"]
                for ring in poly
            )
        else:
            continue
        ET.SubElement(root, f"{{{SVG_NS}}}path", attrib={"class": "checklist-county", "d": d})
    # 2. Occurrence dots on top (existing loop unchanged)
    clipped = 0
    for lon, lat in points:
        ...
```

**Attribute sort + write pattern** (lines 194-202, current — unchanged, must be preserved):
```python
for elem in root.iter():
    if elem.attrib:
        elem.attrib = dict(sorted(elem.attrib.items()))
out_path = out_dir / f"{slug}.svg"
out_path.parent.mkdir(parents=True, exist_ok=True)
out_path.write_text(
    ET.tostring(root, xml_declaration=True, encoding="unicode"),
    encoding="utf-8",
)
```

**`generate_species_maps` query change** (lines 397-404, current):
```python
species_rows = con.execute(
    f"""
    SELECT canonical_name, slug
    FROM read_parquet('{species_parquet}')
    WHERE (occurrence_count > 0 OR on_checklist = true)   -- CHANGED: was occurrence_count > 0
      AND specific_epithet IS NOT NULL
    ORDER BY canonical_name
    """
).fetchall()
```

**Checklist county data read** (new, after occ_rows read in `generate_species_maps`):
```python
checklist_parquet = ASSETS_DIR / "checklist.parquet"
checklist_counties_by_canon: dict[str, set[str]] = defaultdict(set)
if checklist_parquet.exists():
    cl_rows = con.execute(
        f"""
        SELECT canonical_name, county
        FROM read_parquet('{checklist_parquet}')
        WHERE canonical_name IS NOT NULL AND county IS NOT NULL
        """
    ).fetchall()
    for canon, county in cl_rows:
        checklist_counties_by_canon[canon].add(county)
```

---

### `data/species_export.py` (utility, file-I/O)

**Analog:** self

**`SPECIES_COLUMNS` extension** (lines 49-55, current):
```python
SPECIES_COLUMNS = [
    'scientificName', 'canonical_name', 'family', 'subfamily', 'tribe',
    'genus', 'subgenus', 'specific_epithet', 'on_checklist', 'status',
    'occurrence_count', 'specimen_count', 'provisional_count',
    'first_occurrence_date', 'last_occurrence_date', 'month_histogram',
    'county_count', 'ecoregion_count', 'checklist_count', 'slug',  # checklist_count added before slug
]
```

**PyArrow schema extension** (lines 149-169, current — add before `slug` entry):
```python
schema = pa.schema([
    # ... existing 18 entries ...
    ('county_count', pa.int64()),
    ('ecoregion_count', pa.int64()),
    ('checklist_count', pa.int64()),   # NEW
    ('slug', pa.string()),
])
```

**`mart_cols` read** (lines 116-117, current): the `mart_cols` slice `SPECIES_COLUMNS[:-1]` excludes `slug` — this is correct; also excludes `checklist_count` only if it comes after `ecoregion_count` in the list. The new `checklist_count` is produced by dbt and present in the sandbox parquet, so the slice must exclude only `slug`. Adjust the slice if needed: `SPECIES_COLUMNS[:-1]` reads all but the last entry (`slug`) — keep this unchanged.

---

### `data/tests/test_species_maps.py` (test)

**Analog:** self (existing test functions as structural pattern)

**Test function structure** (lines 25-34, existing `test_write_species_svg_creates_subdir`):
```python
def test_write_species_svg_creates_subdir(tmp_path):
    backdrop = ET.Element(f"{{{SVG_NS}}}svg")
    slug = "Andrena/milwaukeensis"
    _write_species_svg(slug, [], backdrop, tmp_path)
    out = tmp_path / "Andrena" / "milwaukeensis.svg"
    assert out.exists(), "..."
```
New tests follow the same `tmp_path` + `ET.Element` + assert pattern. The updated `_write_species_svg` signature requires `checklist_counties` and `county_geojsons_by_name` parameters — test stubs pass `set()` and `{}` for the no-fill case, and a populated dict for the fill case.

**New test: county fill renders `class="checklist-county"` paths**:
```python
def test_write_species_svg_renders_checklist_county_fill(tmp_path):
    backdrop = ET.Element(f"{{{SVG_NS}}}svg")
    # Minimal county GeoJSON polygon covering one "county"
    county_geom = {"type": "Polygon", "coordinates": [[[0,0],[1,0],[1,1],[0,1],[0,0]]]}
    county_geojsons_by_name = {"TestCounty": county_geom}
    checklist_counties = {"TestCounty"}
    _write_species_svg("Genus/epithet", [], checklist_counties, county_geojsons_by_name, backdrop, tmp_path)
    tree = ET.parse(str(tmp_path / "Genus" / "epithet.svg"))
    root = tree.getroot()
    ns = {'s': SVG_NS}
    checklist_paths = root.findall('.//s:path[@class="checklist-county"]', ns)
    assert len(checklist_paths) == 1, "Expected one checklist-county path"
```

**New test: county not in checklist produces no fill**:
```python
def test_write_species_svg_no_checklist_fill_when_county_absent(tmp_path):
    backdrop = ET.Element(f"{{{SVG_NS}}}svg")
    county_geom = {"type": "Polygon", "coordinates": [[[0,0],[1,0],[1,1],[0,1],[0,0]]]}
    county_geojsons_by_name = {"OtherCounty": county_geom}
    checklist_counties = {"TestCounty"}  # different county — no match
    _write_species_svg("Genus/epithet", [], checklist_counties, county_geojsons_by_name, backdrop, tmp_path)
    tree = ET.parse(str(tmp_path / "Genus" / "epithet.svg"))
    root = tree.getroot()
    ns = {'s': SVG_NS}
    checklist_paths = root.findall('.//s:path[@class="checklist-county"]', ns)
    assert len(checklist_paths) == 0, "Expected no checklist-county paths when county absent"
```

---

### `_data/species.js` (utility, transform)

**Analog:** self

**`genusList` map lambda** (lines 110-146, current): The `withOcc` filter at line 114 (`sp.occurrence_count > 0`) is the sole change point. The color index computation must remain over `withOcc` only. Checklist-only species are appended separately after `speciesOnly`:

```javascript
// After speciesOnly is built (line 128), add:
const checklistOnly = g.allMembers
  .filter(sp => sp.occurrence_count === 0 && sp.on_checklist && sp.specific_epithet !== null)
  .sort((a, b) => a.canonical_name.localeCompare(b.canonical_name));
const checklistSpecies = checklistOnly.map(sp => ({ ...sp, hexColor: '#cccccc' }));
const species = [...speciesOnly, ...checklistSpecies];
// (existing unresolvedOccurrences "Genus sp." entry appended after both)
```

Color value: use `'#cccccc'` — matches the pre-existing test at `src/tests/data-species.test.ts` line 105 (`expect(sp.hexColor).toBe('#cccccc')`). Do NOT use `'#aaaaaa'` (that is `_UNRESOLVED_COLOR` for genus-level records with no epithet).

**`subgenusList` map lambda** (lines 168-206, current): Same extension — append `checklistOnly` species with `hexColor: '#cccccc'`. Also fix the trailing filter at line 206:

```javascript
// Current (line 206):
.filter(g => g.totalOccurrences > 0);
// Replace with:
.filter(g => g.totalOccurrences > 0 || g.checklistCount > 0);
```

Add `checklistCount` to the returned object (sum of `checklist_count` across checklist-only members):

```javascript
return {
  // ... existing fields ...
  totalOccurrences: withOcc.reduce((acc, sp) => acc + sp.occurrence_count, 0),
  checklistCount: checklistOnly.reduce((acc, sp) => acc + (sp.checklist_count || 0), 0),  // NEW
};
```

---

### `_pages/species.njk` (template, request-response)

**Analog:** `_pages/genus.njk` (lines 23-29, `<span class="count">` slot pattern)

**Current count slot** (line 23 of `species.njk`):
```nunjucks
<span class="count">{{ sp.occurrence_count }} records</span>
```

**Pattern from `genus.njk`** (line 27 — conditional display):
```nunjucks
{%- if sp.slug %}<a href="..."><em>{{ sp.scientificName }}</em></a>{%- else %}<em>{{ sp.scientificName }}</em>{%- endif %}
```

**New count slot** (replace line 23):
```nunjucks
{%- if sp.occurrence_count > 0 -%}
  <span class="count">{{ sp.occurrence_count }} records</span>
{%- elif sp.on_checklist -%}
  <span class="count checklist-badge">checklist only</span>
{%- else -%}
  <span class="count">0 records</span>
{%- endif -%}
```

---

### `_pages/species-detail.njk` (template, request-response)

**Analog:** self (lines 1-41)

**SVG condition** (line 24-26, current):
```nunjucks
{%- if sp.occurrence_count > 0 -%}
  <img loading="lazy" src="/data/species-maps/{{ sp.slug }}.svg" alt="...">
{%- endif -%}
```
Replace condition (D-06):
```nunjucks
{%- if sp.occurrence_count > 0 or sp.on_checklist -%}
  <img loading="lazy" src="/data/species-maps/{{ sp.slug }}.svg" alt="...">
{%- endif -%}
```

**Seasonality viz script** (line 36, current):
```nunjucks
<script>customElements.whenDefined('seasonality-viz').then(function(){document.getElementById('sviz').data={{ sp.month_histogram | dump | safe }};});</script>
```
Extend to wire `onChecklist` property (D-13):
```nunjucks
<script>customElements.whenDefined('seasonality-viz').then(function(){
  var el = document.getElementById('sviz');
  el.data = {{ sp.month_histogram | dump | safe }};
  el.onChecklist = {{ sp.on_checklist | dump | safe }};
});</script>
```

**Attribution line** (line 37, after metadata `<p>` — new, D-08/D-09):
```nunjucks
{%- if sp.on_checklist -%}
  <p class="checklist-attribution">{{ sp.checklist_count }} checklist records · <a href="https://jhr.pensoft.net/article/129013/">Bartholomew et al. 2024</a></p>
{%- endif -%}
```

**Atlas link hide** (line 38-38, current):
```nunjucks
<a href="/?taxon={{ sp.scientificName | urlencode }}&amp;taxonRank=species">View {{ sp.occurrence_count }} occurrences on the atlas →</a>
```
Wrap in condition (D-15):
```nunjucks
{%- if sp.occurrence_count > 0 -%}
  <a href="/?taxon={{ sp.scientificName | urlencode }}&amp;taxonRank=species">View {{ sp.occurrence_count }} occurrences on the atlas →</a>
{%- endif -%}
```

---

### `_pages/genus.njk` (template, request-response)

**Analog:** `_pages/subgenus.njk` (identical `<span class="count">` and `<li>` structure)

**Current species list loop** (lines 23-29 of `genus.njk`):
```nunjucks
{%- for sp in genus.species -%}
  <li>
    <span class="swatch" style="background: {{ sp.hexColor }};" aria-hidden="true"></span>
    {%- if sp.slug %}<a href="/species/{{ sp.slug }}/index.html"><em>{{ sp.scientificName }}</em></a>{%- else %}<em>{{ sp.scientificName }}</em>{%- endif %}
    <span class="count">{{ sp.occurrence_count }} records</span>
  </li>
{%- endfor -%}
```

**New count slot** (D-01 — show checklist_count for zero-occurrence species):
```nunjucks
    {%- if sp.occurrence_count > 0 -%}
      <span class="count">{{ sp.occurrence_count }} records</span>
    {%- elif sp.on_checklist -%}
      <span class="count">{{ sp.checklist_count }} checklist records</span>
    {%- else -%}
      <span class="count">0 records</span>
    {%- endif -%}
```

---

### `_pages/subgenus.njk` (template, request-response)

**Analog:** `_pages/genus.njk` (identical pattern to genus.njk change above)

**Current species list loop** (lines 25-29 of `subgenus.njk`):
```nunjucks
<span class="count">{{ sp.occurrence_count }} records</span>
```
Apply identical `{%- if sp.occurrence_count > 0 -%}` conditional as genus.njk above.

---

### `src/species/seasonality-viz.ts` (component, event-driven)

**Analog:** self

**New `@property`** (after line 39, the existing `data` property):
```typescript
@property({ attribute: false }) data: number[] = new Array(12).fill(0);
@property({ attribute: false }) onChecklist = false;   // NEW
```

**VIZ-02 fallback branch extension** (lines 60-71, current):
```typescript
if (total < 5) {
  // NEW: distinguish all-zero checklist-only from truly zero records
  if (total === 0 && this.onChecklist) {
    return html`<p class="viz-fallback">Monthly phenology not recorded</p>`;
  }
  // existing logic unchanged below
  const monthsWithData: string[] = [];
  ...
}
```
Insert the early return for `total === 0 && this.onChecklist` as the first check inside the `total < 5` branch. The existing `total < 5` fallback for 1-4 records continues unchanged.

---

### `src/tests/seasonality-viz.test.ts` (test)

**Analog:** self (existing VIZ-02 fallback tests at lines 26-34, 112-121 as structural pattern)

**New test** (add to `describe('seasonality-viz (VIZ-01..05)')` block):
```typescript
test('VIZ-02 checklist fallback: total=0 + onChecklist=true renders "Monthly phenology not recorded"', async () => {
  await import('../species/seasonality-viz.ts');
  document.body.innerHTML = `<seasonality-viz></seasonality-viz>`;
  const el = document.querySelector('seasonality-viz') as any;
  el.data = new Array(12).fill(0);
  el.onChecklist = true;
  await el.updateComplete;
  const fallback = el.querySelector('p.viz-fallback');
  expect(fallback).not.toBeNull();
  expect(fallback?.textContent ?? '').toBe('Monthly phenology not recorded');
});

test('VIZ-02 checklist fallback: total=0 + onChecklist=false renders "0 records" (not checklist note)', async () => {
  await import('../species/seasonality-viz.ts');
  document.body.innerHTML = `<seasonality-viz></seasonality-viz>`;
  const el = document.querySelector('seasonality-viz') as any;
  el.data = new Array(12).fill(0);
  el.onChecklist = false;
  await el.updateComplete;
  const fallback = el.querySelector('p.viz-fallback');
  expect(fallback?.textContent ?? '').toBe('0 records');
});
```

---

### `src/tests/data-species.test.ts` (test)

**Analog:** self

**Count assertion update** (line 54, current):
```typescript
expect(list.length).toBeGreaterThan(500); // 527 confirmed
```
Update to:
```typescript
expect(list.length).toBeGreaterThan(560); // 565 checklist species (SPEC-01)
```

**New genusList checklist assertion** (add after line 98):
```typescript
test('genusList contains at least one species with occurrence_count === 0 and on_checklist (D-03)', () => {
  const list = (species as any).genusList;
  const allSpecies = list.flatMap((g: any) => g.species);
  const checklistOnly = allSpecies.filter((sp: any) =>
    sp.occurrence_count === 0 && sp.on_checklist
  );
  expect(checklistOnly.length).toBeGreaterThan(0);
  for (const sp of checklistOnly) {
    expect(sp.hexColor).toBe('#cccccc');
  }
});
```

**Existing zero-occurrence test** (lines 100-109): this test currently passes vacuously because no zero-occurrence species exist in `genusList`. After D-03, it will have real data — no change needed to the assertion itself (`expect(sp.hexColor).toBe('#cccccc')`), but confirm the implementation uses `'#cccccc'` not `'#aaaaaa'`.

**`subgenusList.every(g => g.totalOccurrences > 0)` test** (line 172-175): this test locks the old behavior. After phase 113 extends `subgenusList` to include checklist-only subgenus groups, this test must be updated:
```typescript
// Replace:
test('subgenusList.every(g => g.totalOccurrences > 0) — zero-occurrence groups excluded', () => {
  expect(list.every((g: any) => g.totalOccurrences > 0)).toBe(true);
});
// With:
test('subgenusList.every(g => g.totalOccurrences > 0 || g.checklistCount > 0)', () => {
  const list = (species as any).subgenusList;
  expect(list.every((g: any) => g.totalOccurrences > 0 || g.checklistCount > 0)).toBe(true);
});
```

---

### `src/tests/build-output.test.ts` (test)

**Analog:** self (existing build output tests at lines 84-102 as structural pattern)

**Pattern — known-species HTML assertion** (lines 84-92):
```typescript
test('emits _site/species/Agapostemon/femoratus/index.html (SPE-01, ...)', () => {
  const html = readFileSync(
    resolve(ROOT, '_site/species/Agapostemon/femoratus/index.html'), 'utf-8'
  );
  expect(html).toContain('<em>Agapostemon femoratus</em>');
  expect(html).toContain('<seasonality-viz');
  expect(html).toContain('/data/species-maps/Agapostemon/femoratus.svg');
  expect(html).toMatch(/View \d+ occurrences on the atlas/);
});
```

**New tests** (add inside the `describe.skipIf(SKIP_BUILD)` block):
```typescript
test('emits page for a known checklist-only species with no atlas link', () => {
  // Planner: replace slug with a confirmed checklist-only species from species.json
  // with occurrence_count === 0 and on_checklist === true.
  // Example: verify by running: jq '.[] | select(.occurrence_count == 0 and .on_checklist) | .slug' public/data/species.json | head -1
  const slug = /* planner fills in verified slug */;
  const html = readFileSync(resolve(ROOT, `_site/species/${slug}/index.html`), 'utf-8');
  expect(html).not.toMatch(/View \d+ occurrences on the atlas/);  // D-15
  expect(html).toContain('Bartholomew et al. 2024');              // D-08
  expect(html).toContain('/data/species-maps/');                  // D-06: SVG shown
});

test('checklist-only species page shows SVG map (D-06)', () => {
  const slug = /* same checklist-only slug */;
  const html = readFileSync(resolve(ROOT, `_site/species/${slug}/index.html`), 'utf-8');
  expect(html).toMatch(/src="\/data\/species-maps\//);
});

test('species index shows "checklist only" badge for zero-occurrence checklist species (D-14)', () => {
  const html = readFileSync(resolve(ROOT, '_site/species/index.html'), 'utf-8');
  expect(html).toContain('checklist only');
});
```

---

## Shared Patterns

### CASE-not-COALESCE for INTEGER[] in DuckDB 1.4.x
**Source:** `data/dbt/models/intermediate/int_species_universe.sql` lines 48-53
**Apply to:** All new dbt CTEs that backfill NULL `INTEGER[12]` values
```sql
CASE WHEN x IS NULL
     THEN [0,0,0,0,0,0,0,0,0,0,0,0]::INTEGER[]
     ELSE x
END
```

### Attribute Sort for SVG Determinism
**Source:** `data/species_maps.py` lines 194-196
**Apply to:** All new SVG element creation in `_write_species_svg`
```python
for elem in root.iter():
    if elem.attrib:
        elem.attrib = dict(sorted(elem.attrib.items()))
```

### `copy.deepcopy(backdrop)` per species
**Source:** `data/species_maps.py` lines 173-174
**Apply to:** `_write_species_svg` — must remain the first line of the function body
```python
root = copy.deepcopy(backdrop)
```

### PyArrow column + schema must stay in sync
**Source:** `data/species_export.py` lines 49-55 (`SPECIES_COLUMNS`) and lines 149-169 (schema)
**Apply to:** `checklist_count` addition — both lists must be updated atomically; the five-step checklist in RESEARCH.md §dbt Contract is the gate.

### Nunjucks conditional display pattern
**Source:** `_pages/genus.njk` lines 26-27
**Apply to:** All count/link conditionals in `species-detail.njk`, `species.njk`, `genus.njk`, `subgenus.njk`
```nunjucks
{%- if condition -%}
  content
{%- endif -%}
```

---

## No Analog Found

All files have close analogs in the codebase. No entries.

---

## Metadata

**Analog search scope:** `data/dbt/models/`, `data/*.py`, `data/tests/`, `_data/`, `_pages/`, `src/species/`, `src/tests/`
**Files scanned:** 15 source files read directly
**Pattern extraction date:** 2026-05-24

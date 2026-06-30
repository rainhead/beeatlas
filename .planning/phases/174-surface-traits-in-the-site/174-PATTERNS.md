# Phase 174: Surface Traits in the Site — Pattern Map

**Mapped:** 2026-06-29
**Files analyzed:** 9 (6 modified, 1 new fixture, 2 test files extended)
**Analogs found:** 9 / 9

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `data/dbt/models/marts/species_traits.sql` | pipeline mart | batch | `data/dbt/models/marts/species.sql` | exact (same config block pattern) |
| `data/species_export.py` | pipeline script | batch/transform | itself (existing `_build_higher_taxa` pattern) | self-analog |
| `data/tests/fixtures/species_traits_fixture.csv` | test fixture | N/A | `data/tests/fixtures/species_fixture.csv` | exact |
| `data/tests/test_species_export.py` | test | batch | itself (existing `sandbox_parquet` fixture) | self-analog |
| `_data/species.js` | build-time data layer | transform | itself (existing `makeSpeciesNode`, `byScientificName`) | self-analog |
| `_pages/species-detail.njk` | template | request-response | itself (existing `metadata`/`checklist-attribution` blocks) | self-analog |
| `_pages/species.njk` | template | request-response | itself (existing `renderNode` species branch, `.node-counts`/`.node-map` spans) | self-analog |
| `_pages/genus.njk` | template | request-response | itself (existing `{%- for sp in sg.species -%}` loop with `.count` span) | self-analog |
| `_pages/subgenus.njk` | template | request-response | `_pages/genus.njk` (same `{%- for sp -%}` + `.count` structure) | exact |
| `src/styles/taxon-pages.css` | style | N/A | itself (existing `.node-counts`, `.node-map`, `focus-visible` rules ending ~line 297) | self-analog |
| `src/tests/data-species.test.ts` | test | N/A | itself (existing `makeSpeciesNode` and `genusList` assertions) | self-analog |

---

## Pattern Assignments

### `data/dbt/models/marts/species_traits.sql` (pipeline mart, batch)

**Analog:** `data/dbt/models/marts/species.sql` lines 8–13

**Config block to add at top of file** (lines 8–13 of species.sql):
```sql
{{ config(
    materialized='external',
    location='target/sandbox/species_traits.parquet',
    format='parquet',
    options={'CODEC': "'SNAPPY'"}
) }}
```

Insert this block before the first `WITH` keyword. No other changes to the SQL body.

The `location` path must use `species_traits.parquet` (matching the mart file name), exactly as `species.sql` uses `species.parquet`. The `higher_taxa.sql` mart uses the identical pattern — both are confirmed references.

---

### `data/species_export.py` (pipeline script, transform)

**Analog:** `_build_higher_taxa` function (lines 136–168) — the pattern for reading a sandbox parquet by path, building a dict keyed on a string column, and gracefully handling absence.

**Merge step to insert after slug computation (after line 235, before the pyarrow schema write at line 240):**
```python
# Phase 174: merge species_traits.parquet into species_rows by canonical_name.
# Path B (RESEARCH.md D-03): traits are a Python-side join, not a dbt JOIN.
# SPECIES_COLUMNS and the pyarrow schema are NOT changed; trait fields enter
# species.json via _jsonify_rows() which serializes ALL dict keys.
_TRAIT_FIELDS = [
    'sociality', 'sociality_source',
    'nesting', 'nesting_source',
    'diet_breadth', 'diet_breadth_source',
    'host_plant_family', 'host_plant_detail',
    'native_status',
    'host_bees', 'host_bee_count',
]
traits_parquet = DBT_SANDBOX_DIR / 'species_traits.parquet'
if traits_parquet.exists():
    trait_rows = con.execute(
        f"SELECT * FROM read_parquet('{traits_parquet}')"
    ).fetchall()
    trait_cols = [d[0] for d in con.description]
    traits_by_name = {
        dict(zip(trait_cols, r))['canonical_name']: dict(zip(trait_cols, r))
        for r in trait_rows
    }
    for r in species_rows:
        t = traits_by_name.get(r['canonical_name'], {})
        for field in _TRAIT_FIELDS:
            r[field] = t.get(field)
else:
    print("  WARNING: species_traits.parquet not found — trait fields omitted from species.json")
    for r in species_rows:
        for field in _TRAIT_FIELDS:
            r[field] = None
```

The `else` branch (warn + null-fill) matches the graceful-degradation decision in RESEARCH.md Open Questions §2. It differs from the hard-fail used for `species.parquet` and `occurrences.parquet` because traits are additive — the rest of the export still works.

The pattern for reading the parquet and fetching column names mirrors lines 151–155 (`_build_higher_taxa`):
```python
rows = con.execute(
    f"SELECT * FROM read_parquet('{higher_taxa_parquet}') ORDER BY rank, name"
).fetchall()
cols = [d[0] for d in con.description]
higher_taxa_rows = [dict(zip(cols, r)) for r in rows]
```

---

### `data/tests/fixtures/species_traits_fixture.csv` (test fixture, new file)

**Analog:** `data/tests/fixtures/species_fixture.csv` — structure (comment header + 1 header row + data rows) and canonical_name values that match the two existing fixture rows.

The fixture header line from `species_fixture.csv` line 15:
```
scientificName,canonical_name,family,...
```

The `species_traits_fixture.csv` header must include `canonical_name` plus all 11 trait-specific fields from `_TRAIT_FIELDS` above. Use the same two canonical names as `species_fixture.csv` (`agapostemon subtilior`, `bombus mixtus`) to enable join tests. Provide at least one row with non-null sociality to exercise the merge path, and one with nulls to exercise the null-passthrough path.

---

### `data/tests/test_species_export.py` (test, extended)

**Analog:** Existing `sandbox_parquet` fixture (lines 47–128) and `test_inat_obs_count_in_species` (lines 170–179) — structure for fixture-based assertions on `export_species_parquet()` output.

**sandbox_parquet fixture extension** — add `species_traits.parquet` generation after the existing `occurrences.parquet` block (after line 93):
```python
# species_traits.parquet: Phase 174 trait merge input.
# Must match canonical_names in species_fixture.csv so the merge can join.
con.execute(f"""
    COPY (
        SELECT * FROM read_csv('{FIXTURES_DIR}/species_traits_fixture.csv',
                               header=True, auto_detect=True)
    )
    TO '{sandbox}/species_traits.parquet' (FORMAT PARQUET)
""")
```

**New test pattern** (mirror `test_inat_obs_count_in_species` at lines 170–179):
```python
def test_trait_fields_in_species_json(tmp_path, monkeypatch, sandbox_parquet):
    """At least one species.json row has a non-null sociality after trait merge (Phase 174)."""
    con = duckdb.connect()
    export_species_parquet(con)
    rows = json.loads((tmp_path / 'species.json').read_text())
    assert rows, "species.json must be non-empty"
    sociality_values = [r.get('sociality') for r in rows]
    assert any(v is not None for v in sociality_values), (
        "Expected at least one species.json row with a non-null sociality field"
    )


def test_trait_fields_absent_gracefully(tmp_path, monkeypatch, sandbox_parquet):
    """When species_traits.parquet is absent, export completes and trait fields are None."""
    # Remove the fixture parquet to simulate local dev without full dbt build.
    (sandbox_parquet / 'species_traits.parquet').unlink()
    con = duckdb.connect()
    export_species_parquet(con)   # must not raise
    rows = json.loads((tmp_path / 'species.json').read_text())
    assert rows, "species.json must be non-empty"
    for row in rows:
        assert row.get('sociality') is None, (
            f"Expected sociality=None when traits absent, got {row.get('sociality')!r}"
        )
```

---

### `_data/species.js` (build-time data layer, transform)

**Analog:** `makeSpeciesNode` function (lines 370–382) — explicit field list that must be extended. Also `genusList` spread pattern (line 107: `{ ...sp, hexColor: ... }`) — this needs NO change because it spreads the entire `sp` row.

**makeSpeciesNode — add trait badge fields** (replace lines 370–382):
```javascript
function makeSpeciesNode(sp) {
  return {
    rank: 'species',
    name: sp.scientificName,
    taxon_id: sp.taxon_id ?? null,
    specimen_count: sp.specimen_count ?? 0,
    inat_obs_count: sp.inat_obs_count ?? 0,
    occurrence_count: sp.occurrence_count ?? 0,
    slug: sp.slug,
    scientificName: sp.scientificName,
    // Phase 174 D-07: trait badge fields for species index leaf nodes.
    sociality: sp.sociality ?? null,
    sociality_source: sp.sociality_source ?? null,
    diet_breadth: sp.diet_breadth ?? null,
    diet_breadth_source: sp.diet_breadth_source ?? null,
    host_plant_family: sp.host_plant_family ?? null,
    children: [],
  };
}
```

**resolveHostBees — add after `byScientificName` is built** (insert after line 53, before `speciesList`):
```javascript
// Phase 174 D-05: resolve host_bees comma-joined strings to typed link targets.
// Uses byScientificName (species-level) and higherTaxaByRankName['genus'] (genus-level).
function resolveHostBees(hostBees) {
  if (!hostBees) return null;
  return hostBees.split(', ').map(name => {
    const trimmed = name.trim();
    const speciesMatch = byScientificName[trimmed];
    if (speciesMatch && speciesMatch.slug) {
      return { name: trimmed, slug: speciesMatch.slug, type: 'species' };
    }
    const genusMatch = higherTaxaByRankName['genus']?.[trimmed];
    if (genusMatch) {
      return { name: trimmed, genusName: trimmed, type: 'genus' };
    }
    return { name: trimmed, type: 'text' };
  });
}

for (const sp of flat) {
  sp.resolvedHostBees = resolveHostBees(sp.host_bees);
}
```

Note: `genusList` and `subgenusList` builders use `{ ...sp, hexColor: ... }` (line 107, line 188) — the spread carries all trait fields automatically with no code change required.

---

### `_pages/species-detail.njk` (template, request-response)

**Analog:** Lines 42–50 — the `{%- if sp.on_checklist -%}` and `{%- if sp.occurrence_count > 0 -%}` conditional blocks show the per-field omission pattern. The `<p class="metadata">` line shows `quantify` filter usage.

**Insert block between line 44 (`{%- endif -%}` after checklist-attribution) and line 45 (`{%- if sp.occurrence_count > 0 -%}`):**
```nunjucks
{%- set hasSociality  = sp.sociality -%}
{%- set hasDiet       = sp.diet_breadth -%}
{%- set hasNesting    = sp.nesting -%}
{%- set hasNative     = sp.native_status -%}
{%- set hasHostBees   = sp.resolvedHostBees and sp.resolvedHostBees.length > 0 -%}
{%- if hasSociality or hasDiet or hasNesting or hasNative or hasHostBees -%}
<section class="traits">
  <h2 class="traits-heading">Traits</h2>
  <dl class="traits-dl">
    {%- if hasSociality -%}
    <dt tabindex="0" title="Source: {%- if sp.sociality_source === 'beegap-species' %}Bee-Gap 2017, species-level{%- elif sp.sociality_source === 'genus-backbone' %}Genus backbone (inferred from genus){%- endif %}">Sociality</dt>
    <dd>{%- if sp.sociality === 'Parasitic' %}Cleptoparasitic{%- else %}{{ sp.sociality }}{%- endif %}</dd>
    {%- endif -%}
    {%- if hasDiet -%}
    <dt tabindex="0" title="Source: {%- if sp.diet_breadth_source === 'fowler' %}Fowler &amp; Droege specialist list{%- elif sp.diet_breadth_source === 'beegap-species' %}Bee-Gap 2017, species-level{%- endif %}">Diet</dt>
    <dd>{%- if sp.diet_breadth === 'specialist' %}{%- if sp.host_plant_family %}Specialist ({{ sp.host_plant_family }}){%- else %}Specialist{%- endif %}{%- else %}Generalist{%- endif %}</dd>
    {%- endif -%}
    {%- if hasNesting -%}
    <dt tabindex="0" title="Source: {%- if sp.nesting_source === 'beegap-species' %}Bee-Gap 2017, species-level{%- elif sp.nesting_source === 'genus-backbone' %}Genus backbone (inferred from genus){%- endif %}">Nesting</dt>
    <dd>{{ sp.nesting }}</dd>
    {%- endif -%}
    {%- if hasNative -%}
    <dt tabindex="0" title="Source: Bee-Gap 2017">Native status</dt>
    <dd>{{ sp.native_status }}</dd>
    {%- endif -%}
    {%- if hasHostBees -%}
    <dt tabindex="0" title="Source: Bee-Gap 2017 cuckoo host records">Host bees</dt>
    <dd>{%- for hb in sp.resolvedHostBees %}{%- if not loop.first %}, {% endif %}{%- if hb.type === "species" %}<a href="/species/{{ hb.slug }}/index.html"><em>{{ hb.name }}</em></a>{%- elif hb.type === "genus" %}<a href="/species/{{ hb.genusName }}/index.html"><em>{{ hb.name }}</em></a>{%- else %}<em>{{ hb.name }}</em>{%- endif %}{%- endfor %}</dd>
    {%- endif -%}
  </dl>
</section>
{%- endif -%}
```

The `{%- set -%}` + outer `{%- if -%}` pattern exactly mirrors the `{%- if sp.on_checklist -%}` guard on line 42. The `{%- if sp.diet_breadth === 'specialist' -%}` guard on the diet row avoids rendering "Generalist (null)" (RESEARCH.md Pitfall 4).

---

### `_pages/species.njk` (template, request-response)

**Analog:** Lines 8–12 — the `{%- if node.rank === "species" -%}` branch of `renderNode`. Badge spans insert between `.node-name` and `.node-counts`.

**Replace lines 8–12 with:**
```nunjucks
{%- if node.rank === "species" -%}
<li data-rank="species" data-name="{{ node.scientificName | lower }}">
  <a class="node-name" href="/species/{{ node.slug }}/index.html"><em>{{ node.scientificName }}</em></a>
  {%- if node.sociality -%}
  <span class="node-badge" tabindex="0"
        title="Sociality: {%- if node.sociality === 'Parasitic' %}Cleptoparasitic{%- else %}{{ node.sociality }}{%- endif %} · {%- if node.sociality_source === 'beegap-species' %}Bee-Gap 2017{%- else %}Genus backbone{%- endif %}">
    {%- if node.sociality === 'Parasitic' %}Clepto{%- else %}{{ node.sociality }}{%- endif -%}
  </span>
  {%- endif -%}
  {%- if node.diet_breadth === 'specialist' -%}
  <span class="node-badge node-badge--specialist" tabindex="0"
        title="Diet: Specialist{%- if node.host_plant_family %} ({{ node.host_plant_family }}){%- endif %} · {%- if node.diet_breadth_source === 'fowler' %}Fowler &amp; Droege{%- else %}Bee-Gap 2017{%- endif %}">Specialist</span>
  {%- endif -%}
  <span class="node-counts">{{ node.specimen_count | quantify("specimen") }} · {{ node.inat_obs_count | quantify("community observation") }}</span>
  <a class="node-map" href="/?taxon={{ node.scientificName | urlencode }}&amp;taxonRank=species" aria-label="Map: {{ node.scientificName }} occurrences">Map</a>
</li>
```

The `data-name` attribute is unchanged — `species-index.ts` filters on it and badges are siblings of `.node-name`, not children.

---

### `_pages/genus.njk` (template, request-response)

**Analog:** Lines 30–42 (subgenus-grouped species list) and lines 48–60 (ungrouped list) and lines 65–78 (no-subgenera flat list). All three `{%- for sp in ... -%}` blocks follow the identical `<li>` structure.

**Badge insertion pattern** — apply to all three species `<li>` blocks, inserting after the `<a>` name link and before the `<span class="count">`:
```nunjucks
      {%- if sp.slug %}<a href="/species/{{ sp.slug }}/index.html"><em>{{ sp.scientificName }}</em></a>{%- else %}<em>{{ sp.scientificName }}</em>{%- endif %}
      {%- if sp.sociality -%}
      <span class="node-badge" tabindex="0"
            title="Sociality: {%- if sp.sociality === 'Parasitic' %}Cleptoparasitic{%- else %}{{ sp.sociality }}{%- endif %} · {%- if sp.sociality_source === 'beegap-species' %}Bee-Gap 2017{%- else %}Genus backbone{%- endif %}">
        {%- if sp.sociality === 'Parasitic' %}Clepto{%- else %}{{ sp.sociality }}{%- endif -%}
      </span>
      {%- endif -%}
      {%- if sp.diet_breadth === 'specialist' -%}
      <span class="node-badge node-badge--specialist" tabindex="0"
            title="Diet: Specialist{%- if sp.host_plant_family %} ({{ sp.host_plant_family }}){%- endif %} · {%- if sp.diet_breadth_source === 'fowler' %}Fowler &amp; Droege{%- else %}Bee-Gap 2017{%- endif %}">Specialist</span>
      {%- endif -%}
      {%- if sp.occurrence_count > 0 -%}
      <span class="count">...
```

`sp.sociality`, `sp.diet_breadth`, `sp.sociality_source`, `sp.diet_breadth_source`, `sp.host_plant_family` are all present on `sp` because `genusList` uses `{ ...sp, hexColor: ... }` (line 107 of `_data/species.js`) which spreads the full species row including all trait fields added by the merge step.

---

### `_pages/subgenus.njk` (template, request-response)

**Analog:** `_pages/genus.njk` — identical `<li>` structure and `{ ...sp }` spread sourced from `subgenusList` (line 188 of `_data/species.js`). Apply the identical badge insertion pattern from genus.njk.

---

### `src/styles/taxon-pages.css` (style)

**Analog:** Lines 281–287 — existing `focus-visible` ring rules; lines 250–275 — existing `.species-list li` flex layout; the `.node-counts` / `.node-map` classes as `flex: 0 0 auto` precedents.

**Insert after line 297** (after the `@media (max-width: 480px)` block, end of file):
```css
/* Phase 174: Traits fact-sheet section on species detail pages */
.traits {
  margin: 0.5rem 0 0.75rem;
}

.traits-heading {
  font-size: 0.85rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary, #444);
  margin: 0 0 0.25rem;
}

.traits-dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  column-gap: 0.75rem;
  row-gap: 0.25rem;
  align-items: baseline;
  margin: 0;
}

.traits-dl dt {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted, #666);
  cursor: help;
}

.traits-dl dt:focus-visible {
  outline: 2px solid var(--accent, #2c7a2c);
  outline-offset: 2px;
  border-radius: 2px;
}

.traits-dl dd {
  font-size: 0.85rem;
  color: var(--text-body, #213547);
  margin: 0;
}

.traits-dl dd a {
  color: var(--link, #646cff);
}

.traits-dl dd a:hover {
  color: var(--link-hover, #535bf2);
}

/* Phase 174: Compact trait badges in species rows (index tree + genus/subgenus pages) */
.node-badge {
  flex: 0 0 auto;
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
  border-radius: 3px;
  background: var(--surface-subtle, #f5f5f5);
  border: 1px solid var(--border, #ddd);
  color: var(--text-muted, #666);
  white-space: nowrap;
  cursor: help;
  line-height: 1.4;
}

.node-badge:focus-visible {
  outline: 2px solid var(--accent, #2c7a2c);
  outline-offset: 2px;
  border-radius: 2px;
}

.node-badge--specialist {
  border-color: var(--accent, #2c7a2c);
  color: var(--accent, #2c7a2c);
}
```

`.node-badge` is NOT scoped to `.species-index` because it must also render inside `.species-list li` on genus/subgenus pages, which are `.taxon-page` elements without `.species-index`. (Confirmed by UI-SPEC §CSS Contract note.)

---

### `src/tests/data-species.test.ts` (test, extended)

**Analog:** Lines 51–56 (`test('exports speciesList...')`) — pattern for importing species data and asserting on fields. Lines 58–63 (`test('exports genusList...')`) — pattern for checking genusList properties.

**New tests to add at end of the `describe` block:**
```typescript
  test('makeSpeciesNode species leaf carries sociality and diet_breadth fields (Phase 174 D-07)', () => {
    // fullTree species leaves must have sociality/diet_breadth keys explicitly set
    // (null is correct for species with no trait data; undefined means makeSpeciesNode
    // omitted the field, which would silently break badge rendering).
    const allLeaves: any[] = [];
    function collectLeaves(node: any) {
      if (node.rank === 'species') allLeaves.push(node);
      if (node.children) node.children.forEach(collectLeaves);
    }
    (species as any).fullTree.forEach(collectLeaves);
    expect(allLeaves.length).toBeGreaterThan(0);
    for (const leaf of allLeaves) {
      expect('sociality' in leaf).toBe(true);       // present (null OK, undefined not)
      expect('diet_breadth' in leaf).toBe(true);
      expect('host_plant_family' in leaf).toBe(true);
    }
  });

  test('genusList species entries carry trait fields via spread (Phase 174 D-07)', () => {
    // genusList uses { ...sp } so all sp fields are present; verify trait keys exist.
    const list = (species as any).genusList;
    expect(list.length).toBeGreaterThan(0);
    const firstGenus = list[0];
    const speciesEntries = firstGenus.species ?? [];
    for (const sp of speciesEntries) {
      // sociality must be a string or null, never undefined
      expect(sp.sociality === null || typeof sp.sociality === 'string').toBe(true);
    }
  });
```

---

## Shared Patterns

### Nunjucks conditional omission (apply to all template changes)
**Source:** `_pages/species-detail.njk` lines 42–44 and 45–47
```nunjucks
{%- if sp.on_checklist -%}
<p class="checklist-attribution">...</p>
{%- endif -%}
```
All trait rows and the outer section use this same `{%- if -%}{%- endif -%}` guard. Never render a `<dt>`/`<dd>` pair when the value is absent (D-04 / RESEARCH.md Pitfall 4).

### CSS variable usage (apply to all new CSS)
**Source:** `src/styles/taxon-pages.css` line 283
```css
outline: 2px solid var(--accent, #2c7a2c);
```
Always use `var(--token, fallback)` — never bare hex values except as fallbacks. Custom properties are defined in `src/index.css` `:root`.

### pyarrow schema — do NOT extend (apply to species_export.py changes)
**Source:** `data/species_export.py` lines 244–268
Trait fields must NOT be added to `SPECIES_COLUMNS` or to the `pa.schema([...])` block. Under Path B, trait fields enter `species.json` via `_jsonify_rows()` serializing all dict keys, but the output `species.parquet` stays at 22 columns. Adding trait fields to the schema would break `test_species_parquet_schema_matches`.

### sandbox_parquet fixture pattern (apply to test extension)
**Source:** `data/tests/test_species_export.py` lines 63–78
```python
con.execute(f"""
    COPY (
        SELECT * REPLACE (
            CAST(on_checklist AS BOOLEAN) AS on_checklist,
            json_extract(month_histogram, '$')::INTEGER[] AS month_histogram
        )
        FROM read_csv('{FIXTURES_DIR}/species_fixture.csv', header=True, auto_detect=True)
    )
    TO '{sandbox}/species.parquet' (FORMAT PARQUET)
""")
```
New `species_traits.parquet` generation in the fixture follows the same `COPY ... FROM read_csv ... TO ... (FORMAT PARQUET)` pattern. No BOOLEAN or array casts needed for the traits fixture (all trait columns are VARCHAR or INTEGER).

---

## No Analog Found

None. All files have close analogs within this codebase.

---

## Metadata

**Analog search scope:** `data/dbt/models/marts/`, `data/`, `data/tests/`, `_data/`, `_pages/`, `src/styles/`, `src/tests/`
**Files read:** 12
**Pattern extraction date:** 2026-06-29

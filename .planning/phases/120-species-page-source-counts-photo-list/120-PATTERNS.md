# Phase 120: Species Page Source Counts & Photo List - Pattern Map

**Mapped:** 2026-05-26
**Files analyzed:** 7
**Analogs found:** 7 / 7

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `_pages/species-detail.njk` | template | request-response | `_pages/genus.njk` | exact (same taxon-page template family) |
| `_pages/genus.njk` | template | request-response | `_pages/subgenus.njk` | exact (identical count branch structure) |
| `_pages/subgenus.njk` | template | request-response | `_pages/genus.njk` | exact (identical count branch structure) |
| `_pages/tribe.njk` | template | request-response | `_pages/genus.njk` | role-match (genus-level count span, same pattern needed) |
| `_data/species.js` | data-module | transform | `_data/species.js` tribeMap block (self, lines 222-256) | self-modification |
| `data/species_export.py` | pipeline-step | batch / file-I/O | `data/species_export.py` seasonality block (self, lines 202-238) | self-modification |
| `data/nightly.sh` | deploy-script | file-I/O | `data/nightly.sh` checklist upload block (self, lines 150-170) | self-modification |

---

## Pattern Assignments

### `_pages/species-detail.njk` (template, request-response)

**Change targets:** line 41 (metadata count label) and lines 45-46 (atlas link).

**Existing metadata line** (`_pages/species-detail.njk` line 41):
```njk
<p class="metadata">{{ sp.occurrence_count }} records · {{ sp.county_count }} counties · {{ sp.ecoregion_count }} ecoregions</p>
```
Replace the leading `{{ sp.occurrence_count }} records` segment with `{{ sp.specimen_count }} specimens · {{ sp.inat_obs_count }} community observations`. County and ecoregion segments stay unchanged.

**Existing atlas link block** (`_pages/species-detail.njk` lines 45-47):
```njk
{%- if sp.occurrence_count > 0 -%}
<a href="/?taxon={{ sp.scientificName | urlencode }}&amp;taxonRank=species">View {{ sp.occurrence_count }} occurrences on the atlas →</a>
{%- endif -%}
```
Replace link text with `View {{ sp.occurrence_count + sp.inat_obs_count }} records on the atlas →`. Nunjucks arithmetic `{{ a + b }}` works natively (confirmed in CONTEXT.md §Code Context). The guard condition `occurrence_count > 0` stays — iNat-only species without WABA occurrences are not yet shown on the atlas.

**Checklist attribution pattern** (lines 42-44 — do not disturb):
```njk
{%- if sp.on_checklist -%}
<p class="checklist-attribution">{{ sp.checklist_count }} checklist records · <a href="https://jhr.pensoft.net/article/129013/">Bartholomew et al. 2024</a></p>
{%- endif -%}
```
This block sits between the metadata `<p>` and the atlas link. The new source-count label goes on line 41; this block is untouched.

---

### `_pages/genus.njk` (template, request-response)

**Change target:** lines 27-33 — the `{%- if sp.occurrence_count > 0 -%}` branch inside the species list loop.

**Existing count branch** (`_pages/genus.njk` lines 27-33):
```njk
{%- if sp.occurrence_count > 0 -%}
<span class="count">{{ sp.occurrence_count }} records</span>
{%- elif sp.on_checklist -%}
<span class="count">{{ sp.checklist_count }} checklist records</span>
{%- else -%}
<span class="count">0 records</span>
{%- endif -%}
```
Replace only the `if` branch body. The `elif` (checklist-only) and `else` (zero) branches are unchanged per D-03:
```njk
{%- if sp.occurrence_count > 0 -%}
<span class="count">{{ sp.specimen_count }} specimens · {{ sp.inat_obs_count }} community observations</span>
{%- elif sp.on_checklist -%}
<span class="count">{{ sp.checklist_count }} checklist records</span>
{%- else -%}
<span class="count">0 records</span>
{%- endif -%}
```

---

### `_pages/subgenus.njk` (template, request-response)

**Change target:** lines 28-34 — identical three-branch structure as `genus.njk`.

**Existing count branch** (`_pages/subgenus.njk` lines 28-34):
```njk
{%- if sp.occurrence_count > 0 -%}
<span class="count">{{ sp.occurrence_count }} records</span>
{%- elif sp.on_checklist -%}
<span class="count">{{ sp.checklist_count }} checklist records</span>
{%- else -%}
<span class="count">0 records</span>
{%- endif -%}
```
Apply same substitution as `genus.njk` — replace the `if` branch body only.

---

### `_pages/tribe.njk` (template, request-response)

**Change target:** line 26 — the per-genus `<span class="count">` inside the genera loop.

**Existing span** (`_pages/tribe.njk` line 26):
```njk
<span class="count">{{ g.occurrence_count }} records</span>
```
Replace with the source-breakdown format. Unlike species pages, there is no checklist-only branch for genera in tribe.njk — all genera in `tribeList` have `occurrence_count > 0` (the `tribeList` filter on line 256 of `_data/species.js` already excludes zero-occurrence tribes, and genera with zero counts are excluded by `filter(([, occ]) => occ > 0)` on line 244). New text:
```njk
<span class="count">{{ g.specimen_count }} specimens · {{ g.inat_obs_count }} community observations</span>
```
This requires `g.specimen_count` and `g.inat_obs_count` to be present on each genus object — provided by the `_data/species.js` tribeMap change below.

---

### `_data/species.js` — tribeMap / tribeList block (data-module, transform)

**Change target:** lines 222-256 — the tribeMap accumulation loop and tribeList `.map()`.

**Existing tribeMap accumulation** (`_data/species.js` lines 225-239):
```javascript
const tribeMap = {};
for (const sp of flat) {
  if (!sp.tribe || sp.tribe.trim() === '') continue;
  if (!tribeMap[sp.tribe]) {
    tribeMap[sp.tribe] = {
      tribe: sp.tribe,
      family: sp.family,
      generaMap: {},
    };
  }
  if (!tribeMap[sp.tribe].generaMap[sp.genus]) {
    tribeMap[sp.tribe].generaMap[sp.genus] = 0;
  }
  tribeMap[sp.tribe].generaMap[sp.genus] += sp.occurrence_count;
}
```
Pattern to follow: the existing `generaMap` accumulates a single numeric value (`occurrence_count`) per genus. Extend by storing an object instead of a bare number, accumulating `occurrence_count`, `specimen_count`, and `inat_obs_count` in parallel:
```javascript
  if (!tribeMap[sp.tribe].generaMap[sp.genus]) {
    tribeMap[sp.tribe].generaMap[sp.genus] = { occurrence_count: 0, specimen_count: 0, inat_obs_count: 0 };
  }
  tribeMap[sp.tribe].generaMap[sp.genus].occurrence_count += sp.occurrence_count;
  tribeMap[sp.tribe].generaMap[sp.genus].specimen_count += (sp.specimen_count || 0);
  tribeMap[sp.tribe].generaMap[sp.genus].inat_obs_count += (sp.inat_obs_count || 0);
```

**Existing tribeList `.map()` genera construction** (`_data/species.js` lines 243-246):
```javascript
const genera = Object.entries(t.generaMap)
  .filter(([, occ]) => occ > 0)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([genus, occurrence_count]) => ({ genus, occurrence_count }));
```
With the accumulator now an object, update accordingly:
```javascript
const genera = Object.entries(t.generaMap)
  .filter(([, counts]) => counts.occurrence_count > 0)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([genus, counts]) => ({ genus, ...counts }));
```
The `totalOccurrences` line below (line 247) uses `g.occurrence_count` which still works after the spread.

**Analog for the reduce pattern:** `genusList` totalOccurrences at line 150:
```javascript
totalOccurrences: speciesOnly.reduce((acc, sp) => acc + sp.occurrence_count, 0) + unresolvedOccurrences,
```
This shows the established pattern for aggregating numeric fields via `.reduce()`. The tribeMap approach uses `+=` in a loop (same semantics).

---

### `data/species_export.py` — photos.json write (pipeline-step, batch/file-I/O)

**Change target:** after line 238 (end of seasonality.json block), before `main()`.

**Analog: seasonality.json write block** (`data/species_export.py` lines 202-238):
```python
# ---- AGG-05: seasonality.json -------------------------------------------
# Nested species → bucket → INT[12] for VIZ-04 lookup. Tight separators
# (Pattern 3) shave ~30% off the on-disk size.
seas_rows = con.execute(
    f"""
    SELECT canonical_name, county, ecoregion_l3, TRY_CAST(month AS INT) - 1 AS m_idx
    FROM read_parquet('{occurrences_parquet_in}')
    WHERE canonical_name IS NOT NULL AND month IS NOT NULL
    """
).fetchall()
...
seas_out = ASSETS_DIR / "seasonality.json"
seas_out.write_text(
    json.dumps(out_seas, sort_keys=True, separators=(',', ':')),
    encoding='utf-8',
)
print(f"  seasonality.json: {len(out_seas):,} species, {seas_size:,} bytes")
```

**Photos.json block to add** — copy the structure exactly: same `con` object, same `ASSETS_DIR` path target, `sort_keys=True`, `indent=2` (matching `species.json` convention since this is a human-inspectable lookup, not a tight-packed histogram). Use `inat_obs_data.observations` directly (not a parquet file), filtering `license IS NOT NULL AND license != 'all rights reserved'`:

```python
# ---- AGG-06: photos.json ------------------------------------------------
# Per-species list of CC-licensed iNat observation photos.
# Structure: { "Canonical Name": [{"url": "...", "license": "..."}, ...] }
# D-07/D-08: keyed by canonical_name, CC-licensed only.
photos_rows = con.execute("""
    SELECT canonical_name, image_url, license
    FROM inat_obs_data.observations
    WHERE license IS NOT NULL AND license != 'all rights reserved'
      AND image_url IS NOT NULL
    ORDER BY canonical_name
""").fetchall()
photos: dict[str, list[dict]] = {}
for canon, url, license_ in photos_rows:
    if canon not in photos:
        photos[canon] = []
    photos[canon].append({"license": license_, "url": url})
photos_out = ASSETS_DIR / "photos.json"
photos_out.write_text(
    json.dumps(photos, sort_keys=True, indent=2),
    encoding='utf-8',
)
print(f"  photos.json: {len(photos):,} species, {photos_out.stat().st_size:,} bytes")
```

Note: sort order within each species list is insertion order (by `canonical_name` from the `ORDER BY`), which satisfies D-07 ("doesn't matter"). The `sort_keys=True` on the outer dict ensures the file is idempotent across runs.

---

### `data/nightly.sh` — photos.json hashed upload (deploy-script, file-I/O)

**Change target:** lines 150-170 — the artifact upload block and manifest.json heredoc.

**Existing upload block pattern** (`data/nightly.sh` lines 150-158):
```bash
occ_name=$(_upload_hashed "$EXPORT_DIR/occurrences.parquet" "occurrences")
species_name=$(_upload_hashed "$EXPORT_DIR/species.json" "species")
seasonality_name=$(_upload_hashed "$EXPORT_DIR/seasonality.json" "seasonality")
counties_name=$(_upload_hashed "$EXPORT_DIR/counties.geojson" "counties" --content-type application/json)
...
checklist_name=$(_upload_hashed "$EXPORT_DIR/checklist.parquet" "checklist")
```

Add after `checklist_name` line (before the `cat > manifest.json` heredoc):
```bash
photos_name=$(_upload_hashed "$EXPORT_DIR/photos.json" "photos")
```

**Existing manifest.json heredoc** (`data/nightly.sh` lines 159-171):
```bash
cat > "$EXPORT_DIR/manifest.json" <<JSON
{
  "occurrences": "$occ_name",
  "species": "$species_name",
  "seasonality": "$seasonality_name",
  "counties": "$counties_name",
  "ecoregions": "$ecoregions_name",
  "places": "$places_name",
  "places_meta": "$places_meta_name",
  "checklist": "$checklist_name",
  "generated_at": "$(_ts)"
}
JSON
```

Add `"photos": "$photos_name",` entry after `"checklist"`, before `"generated_at"`. Key name `"photos"` follows the lowercase snake_case stem convention (CONTEXT.md §Established Patterns).

---

## Shared Patterns

### Nunjucks Arithmetic
**Source:** CONTEXT.md §Established Patterns (confirmed native support)
**Apply to:** `species-detail.njk` atlas link
```njk
{{ sp.occurrence_count + sp.inat_obs_count }}
```
No filter or helper needed — Nunjucks evaluates inline arithmetic directly.

### JSON Write Convention
**Source:** `data/species_export.py` lines 193-194
**Apply to:** `photos.json` write in `species_export.py`
```python
json.dumps(..., sort_keys=True, indent=2)
```
`sort_keys=True` ensures byte-for-byte idempotency across runs. `indent=2` for human-readable diff-friendly output (unlike `seasonality.json` which uses tight separators for size).

### Hashed Upload Pattern
**Source:** `data/nightly.sh` lines 139-148 (`_upload_hashed` function) and line 157 (`checklist_name` call)
**Apply to:** `photos.json` upload
```bash
_upload_hashed() {
    local src="$1" basename="$2"; shift 2
    local ext="${src##*.}"
    local hash; hash=$(sha256sum "$src" | awk '{print $1}' | cut -c1-12)
    local hashed_name="${basename}-${hash}.${ext}"
    aws --profile "$AWS_PROFILE" s3 cp --no-progress \
        --cache-control "public, max-age=31536000, immutable" \
        "$@" "$src" "s3://$BUCKET/data/$hashed_name" >&2
    echo "$hashed_name"
}
# Invocation (no extra --content-type needed for .json):
photos_name=$(_upload_hashed "$EXPORT_DIR/photos.json" "photos")
```

### Genus-Level Numeric Accumulator Pattern
**Source:** `_data/species.js` lines 235-238 (existing tribeMap loop)
**Apply to:** extended tribeMap accumulation for `specimen_count`/`inat_obs_count`
```javascript
tribeMap[sp.tribe].generaMap[sp.genus] += sp.occurrence_count;
// Extend: store object instead of bare number, accumulate all three fields
```

---

## No Analog Found

All files have direct analogs or are self-modifications. No files in this phase require pattern invention from scratch.

---

## Metadata

**Analog search scope:** `_pages/`, `_data/`, `data/` (nightly.sh, species_export.py, checklist_pipeline.py)
**Files scanned:** 7 source files read directly
**Pattern extraction date:** 2026-05-26

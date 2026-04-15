# Domain Pitfalls: DEM Elevation Annotation

**Domain:** Adding elevation_m column to ecdysis.parquet and samples.parquet by sampling USGS 3DEP 10m DEM at specimen/sample lat/lon coordinates
**Researched:** 2026-04-15
**Confidence:** HIGH (core technical pitfalls); MEDIUM (caching/CI integration specifics)

---

## Pitfall Summary Table

| # | Pitfall | Risk | Phase |
|---|---------|------|-------|
| 1 | DEM nodata value treated as real elevation | CRITICAL | DEM download & sampling |
| 2 | CRS/datum mismatch (NAD83 DEM vs WGS84 points) | HIGH | DEM download & sampling |
| 3 | Out-of-bounds sampling for coastal/border specimens | HIGH | DEM download & sampling |
| 4 | DEM file re-downloaded every nightly run | HIGH | DEM download & caching |
| 5 | INT16 overflow for negative elevations or nodata sentinels | HIGH | Schema design |
| 6 | Ocean/water body returns zero instead of NULL | HIGH | DEM sampling |
| 7 | DEM file size bloats CI artifact or S3 sync | MEDIUM | CI/pipeline integration |
| 8 | Schema gate not updated before CI build uses new column | MEDIUM | Schema gate (CI) |
| 9 | Vectorized vs row-by-row sampling performance | MEDIUM | DEM sampling |
| 10 | Floating-point elevation stored as FLOAT32 precision loss | LOW | Schema design |
| 11 | DEM tile boundary artefacts at specimen coordinates | LOW | DEM sampling |
| 12 | Vertical datum mismatch (NAVD88 vs ellipsoidal) | LOW | DEM source selection |

---

## Critical Pitfalls

### Pitfall 1: DEM Nodata Value Treated as Real Elevation

**What goes wrong:** USGS 3DEP GeoTIFF files store missing/void pixels as a numeric sentinel. For integer DEMs this is commonly -9999; for the float32 variant it may be a large negative IEEE float. Rasterio's `.sample()` generator returns these raw values without masking unless explicitly told the nodata value. Code that naively casts the sampled value to INT16 will store -9999 as a valid elevation.

**Why it happens:** rasterio's low-level `.sample()` does not automatically convert nodata to None/NaN. The dataset's `.nodata` attribute must be read and compared manually, or `masked=True` must be passed to `.read()` to get a numpy masked array.

**Consequences:** Specimens near data voids (mountain ridgelines, border pixels, water bodies) get elevation_m = -9999 in parquet. DuckDB filter queries like `elevation_m BETWEEN 0 AND 500` silently exclude or misrepresent those specimens.

**Prevention:**
1. After sampling, compare each result against `dataset.nodata` and convert to Python `None` before writing.
2. Assert in export.py: `SELECT COUNT(*) FROM ... WHERE elevation_m < -500` — should be 0.
3. Use `masked=True` when reading a window to let numpy flag nodata as masked.

**Detection:** Run `SELECT MIN(elevation_m), MAX(elevation_m), COUNT(*) FILTER (WHERE elevation_m < -500) FROM read_parquet('ecdysis.parquet')` immediately after generating the file.

---

### Pitfall 2: CRS/Datum Mismatch (NAD83 DEM vs WGS84 Specimen Coordinates)

**What goes wrong:** USGS 3DEP 1/3-arc-second DEM uses NAD83 horizontal datum. Ecdysis and iNaturalist coordinates are WGS84. NAD83 and WGS84 initially agreed to within 1-2 cm, but modern realizations (NAD83(2011) vs WGS84(G1762)) differ by up to 1-2 meters in the contiguous US. For 10m resolution pixels, a 1-2m horizontal shift moves a point to an adjacent pixel — potentially a different elevation value on steep terrain.

**Why it happens:** WGS84 vs NAD83 looks identical to `pyproj` unless you force an explicit datum transformation. Rasterio defaults to assuming the DEM's CRS and the point CRS are compatible, silently using the same numeric coordinates without datum shift.

**Consequences:** On flat terrain: no observable error. On steep Cascade/Olympic terrain (common for WA bee specimens at elevation): up to ~30m elevation error from pixel misalignment.

**Prevention:**
1. For 10m DEM, the 1-2m horizontal error is within one pixel. Accept this as a known limitation (elevation is inferential anyway).
2. Document in code comments that coordinates are passed directly to the DEM without datum conversion.
3. Do NOT attempt explicit NADCON5/HTDP datum transformation — complexity outweighs a sub-pixel benefit at 10m resolution.

**Detection:** Compare a handful of known-elevation specimens against USGS spot elevations; expect less than or equal to 10m disagreement on moderate terrain.

---

### Pitfall 3: Out-of-Bounds Sampling for Coastal/Border Specimens

**What goes wrong:** A single-tile WA DEM will have a bounding box. Specimens collected on coastline, Puget Sound islands, or near the Oregon/Idaho borders may fall outside the tile extent. rasterio raises an inconsistent exception depending on whether the out-of-bounds coordinate falls in the buffer or strictly outside, and the behavior changed between rasterio versions.

**Why it happens:** The 3DEP 10m WA tile does not extend into the ocean or adjacent states. Any sample-point query that hits `.sample()` with coordinates outside the raster extent will either return the nodata value or raise a `rasterio.errors.WindowError`.

**Consequences:** Pipeline crash or silent nodata for coastal specimens. WA has significant coastal collection activity (San Juan Islands, Olympic Peninsula coast).

**Prevention:**
1. Before sampling, filter coordinates against the DEM's bounding box (`dataset.bounds`). Set elevation_m = NULL for out-of-bounds points.
2. Wrap per-point sampling in a try/except and assign NULL on any bounds error.
3. Assert in export.py that null elevation_m is allowed (not flagged as an error, unlike null county).

**Detection:** `SELECT COUNT(*) FROM read_parquet('ecdysis.parquet') WHERE elevation_m IS NULL` — a small but non-zero count is expected and correct for coastal specimens.

---

## High Risk Pitfalls

### Pitfall 4: DEM File Re-Downloaded Every Nightly Run

**What goes wrong:** The WA DEM GeoTIFF is 100MB+. Without caching, every nightly run re-downloads it from USGS, adding 2-5 minutes to the pipeline and risking rate-limiting or transient failures.

**Why it happens:** The existing pipeline caches data in S3 (beeatlas.duckdb, samples.parquet, etc.) but has no precedent for large binary raster files. A naive implementation adds a download step that runs unconditionally.

**Consequences:** Nightly pipeline becomes fragile — USGS TNM server has intermittent availability. A failed download at 2am aborts the entire nightly run without updating specimens.

**Prevention:**
1. Cache the DEM in S3 at `dem/wa_10m.tif` and download to `/tmp/wa_10m.tif` at nightly.sh start, following the existing DuckDB `s3 cp` pattern.
2. Use a SHA256 or ETag check before re-downloading: if the local file exists and matches, skip download.
3. Better: download once, store permanently in S3 under `dem/`, never re-download unless a version file changes. The 3DEP 10m DEM for WA does not change nightly; USGS updates it quarterly at most.
4. Add DEM cache restore steps to nightly.sh in the same pattern as the DuckDB pull.

**Detection:** Time the nightly run before/after adding DEM caching. The DEM step should add less than 5 seconds on cache hit.

---

### Pitfall 5: INT16 Overflow for Negative Elevations or Nodata Sentinels

**What goes wrong:** INT16 range is -32,768 to 32,767. Washington's highest point (Mt. Rainier, 4,392m) is safely within range. However, if nodata values (-9999) are not caught before `CAST(... AS SMALLINT)`, the value -9999 fits in INT16 and silently stores as a valid elevation. The danger is that the sentinel fits cleanly, so no overflow exception is raised to signal the problem.

**Why it happens:** DuckDB's `CAST(value AS SMALLINT)` on -9999 succeeds without error. The pipeline author may test the happy path (positive elevations 0-4400) and not notice the nodata case passes through.

**Consequences:** Described in Pitfall 1. INT16 is a correct type choice for this domain; the risk is in nodata handling upstream, not in INT16 itself.

**Prevention:**
1. Null-check BEFORE casting: apply `None` for nodata in Python before the DuckDB COPY step.
2. Unit test the sampling function with a mock raster that has nodata pixels.

---

### Pitfall 6: Ocean/Water Body Returns Zero Instead of NULL

**What goes wrong:** Some 3DEP processing pipelines fill ocean and water body pixels with 0 (sea level) rather than nodata. A specimen collected on a San Juan Island beach could legitimately be at 0-5m elevation, but a specimen miscoordinated to open water should get NULL, not 0.

**Why it happens:** Zero is a valid elevation for coastal specimens but is also the conventional fill value for water bodies in some DEM products. The two cases are visually indistinguishable in the data.

**Consequences:** Specimens with imprecise coordinates (field-recorded locations) may get elevation_m = 0 when they should get NULL. This makes the elevation filter behave unexpectedly: `elevation_m BETWEEN 0 AND 100` matches all coastal/water-body outliers.

**Prevention:**
1. Check the specific 3DEP 10m WA file metadata at acquisition time: `gdalinfo wa_10m.tif` to confirm the nodata value and water-body handling.
2. If water bodies are 0-filled, accept this as a limitation and document it. Specimens accurately collected on beaches may genuinely be at 0m.
3. Document the behavior in a code comment near the sampling logic.

---

### Pitfall 7: DEM File Size Bloats CI Artifact or S3 Sync

**What goes wrong:** GitHub CI's frontend-only build does not run the pipeline, so the DEM file should never appear in CI artifacts. But if the DEM path is accidentally added to ASSETS_DIR or the S3 sync glob, a 100MB+ file could be uploaded to the `/data/` CloudFront path.

**Why it happens:** The nightly.sh `for f in ecdysis.parquet samples.parquet ...` loop is explicit, so this risk is low. The danger is a developer accidentally running the pipeline with EXPORT_DIR set to `frontend/public/data/`.

**Consequences:** If the DEM is uploaded to S3 `/data/wa_10m.tif` it wastes S3 storage and CloudFront transfer budget. It will never be served to clients since no frontend references it.

**Prevention:**
1. Store the DEM exclusively in `/tmp/` during pipeline execution (already the nightly.sh pattern).
2. Cache in S3 under `dem/` prefix, never `data/` prefix.
3. Add `*.tif` to `.gitignore` in the data directory.
4. Assert that EXPORT_DIR contains only parquet/geojson/feeds outputs.

---

### Pitfall 8: Schema Gate Not Updated Before CI Build Uses New Column

**What goes wrong:** `validate-schema.mjs` checks that `elevation_m` exists in both parquet files. If the pipeline phase that adds the column ships before the schema gate update, CI will fail on the CloudFront check because production parquets do not yet have the column.

**Why it happens:** The schema gate has two modes: local (validates freshly built parquets) and CloudFront (validates production). Adding `elevation_m` to EXPECTED before it is in production causes CloudFront-mode failures until the first post-merge nightly run.

**Consequences:** CI build fails for all PRs between schema gate update and first successful nightly run.

**Prevention:**
1. Ship pipeline changes (export.py adds elevation_m) and schema gate update (validate-schema.mjs adds elevation_m to EXPECTED) in the same commit/PR.
2. CI runs validate-schema.mjs against local parquets when present — this works correctly because the pipeline runs first.
3. If a PR updates only the schema gate without local parquets present, CI uses CloudFront mode and fails. The safe pattern established in prior phases is: schema gate update ships with the pipeline change, not ahead of it.

---

## Moderate Pitfalls

### Pitfall 9: Vectorized vs Row-by-Row Sampling Performance

**What goes wrong:** For 55,000 points (46k specimens + 9.5k samples), naively calling `dataset.sample([(lon, lat)])` in a Python loop creates a generator call per point. On a loaded maderas cron server, this can take 30-120 seconds.

**Why it happens:** rasterio's `.sample()` is a generator that processes one coordinate at a time. Repeated Python-layer overhead dominates for thousands of points.

**Prevention:**
1. Use rasterio's `.sample(list_of_xy_tuples)` with all coordinates passed at once — this feeds the full list to the underlying C layer in one call.
2. Alternative: convert all (lon, lat) pairs to pixel indices via `dataset.index(xs, ys)` as a vectorized numpy operation, then do a single array lookup.
3. For 55k points at 10m resolution, either vectorized approach runs in under 5 seconds. Python-loop is only a problem if coordinates are processed one at a time with file open/close per point.

---

### Pitfall 10: FLOAT32 Precision Loss

**What goes wrong:** If elevation is written as FLOAT32 (single precision), values may exhibit IEEE 754 rounding artifacts. For integer meter values this is negligible.

**Prevention:** Use INT16 (SMALLINT in DuckDB) as specified in PROJECT.md. DuckDB `CAST(sampled_value AS SMALLINT)` truncates fractional meters at the sampling stage, which is appropriate for display precision. No floating-point storage involved.

---

### Pitfall 11: DEM Tile Boundary Artefacts

**What goes wrong:** If the WA DEM is assembled from multiple tiles, seam lines can introduce ±1m vertical discontinuities. A specimen at a tile boundary may get a slightly different elevation from adjacent specimens at the same actual elevation.

**Prevention:** Download the pre-mosaicked seamless 3DEP product (single GeoTIFF covering all of WA) rather than individual 1°x1° tiles. The USGS National Map downloader provides a seamless export option. Verify by checking if the downloaded file covers the full WA bounding box (`gdalinfo wa_10m.tif | grep "Upper Left\|Lower Right"`).

---

### Pitfall 12: Vertical Datum Mismatch (NAVD88 vs Ellipsoidal)

**What goes wrong:** 3DEP 10m DEM vertical datum is NAVD88 (North American Vertical Datum 1988), not ellipsoidal height. GPS-derived elevations use ellipsoidal height, which differs from NAVD88 by the geoid undulation (~20-40m in Washington).

**Why it happens:** This matters if elevation_m is ever compared against GPS altimeter readings or iNaturalist-reported elevation fields.

**Consequences:** For a "display only / filter by range" use case within this parquet, the absolute vertical datum choice is irrelevant as long as it is internally consistent.

**Prevention:** Document in a code comment that elevation_m is NAVD88. If cross-referencing external elevation data in a future phase, apply geoid correction (GEOID18 model).

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|----------------|------------|
| DEM source download | Nodata sentinel identity unknown until runtime | Run `gdalinfo` on the file at download; assert sentinel in pipeline code |
| DEM caching | 100MB re-download every nightly run | S3 cache key under `dem/`; skip download if local `/tmp/wa_10m.tif` exists |
| Point sampling | Coastal/out-of-bounds specimens raise rasterio exception | Bounds check before sampling; assign NULL for out-of-bounds |
| Point sampling | Nodata sentinel stored as real elevation | Compare raw value against `dataset.nodata` and assign None before DuckDB COPY |
| Schema/type | DuckDB CAST on nodata value succeeds silently | Null-check before cast; post-export assertion query `WHERE elevation_m < -500` |
| export.py integration | Ocean pixels with 0 fill value | Inspect DEM metadata at acquisition; document water-body handling decision |
| validate-schema.mjs update | Schema gate ships ahead of pipeline | Ship schema gate update in same commit as export.py elevation_m change |
| CI / S3 sync | DEM file accidentally placed in ASSETS_DIR | Keep DEM in `/tmp/`; DEM S3 key must be `dem/` not `data/` |
| Filter toolbar (frontend) | elevation_m IS NULL specimens excluded by BETWEEN filter | SQL filter should use `elevation_m IS NULL OR elevation_m BETWEEN min AND max` semantics |

---

## Sources

- USGS 3DEP FAQ — projection, datum, resolution: https://www.usgs.gov/faqs/what-projection-horizontal-datum-vertical-datum-and-resolution-a-usgs-digital-elevation-model
- USGS 3DEP 1/3 arc-second DEM collection: https://www.sciencebase.gov/catalog/item/4f70aa9fe4b058caae3f8de5
- USGS 3DEP 10m on Google Earth Engine (dtype, CRS, nodata): https://developers.google.com/earth-engine/datasets/catalog/USGS_3DEP_10m_collection
- rasterio out-of-bounds sampling issue: https://github.com/rasterio/rasterio/issues/1904
- NAD83 vs WGS84 datum shift magnitude (NGS): https://www.ngs.noaa.gov/CORS/Articles/WGS84NAD83.pdf
- Geocomputation with Python — raster-vector interactions: https://py.geocompx.org/05-raster-vector
- Vectorized raster sampling performance: https://rdrn.me/optimising-sampling/

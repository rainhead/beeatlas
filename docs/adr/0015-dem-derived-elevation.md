# ADR 0015: DEM-derived elevation is a separate column, and checklist rows never get one

**Status:** Accepted (implemented 2026-07-25; issue beeatlas-sn8)

---

## Context

`marts/occurrences.elevation_m` is **recorded** elevation, and it comes from exactly
one place: Ecdysis's `minimum_elevation_in_meters`, read in `int_ecdysis_base.sql`.
The other four arms of `int_combined` hardcode `NULL::INTEGER`. The result is a
column populated on 45% of occurrences where the gap is an **entire-arm** gap, not a
random one:

| arm | rows | with recorded elevation |
|---|---|---|
| `specimen` (Ecdysis) | 49,919 | 88.6% |
| `inat_expert` | 28,850 | 0% |
| `checklist` | 19,929 | 0% |
| `waba_specimen` | 40 | 0% |
| `provisional_sample` | 37 | 0% |

Every occurrence has coordinates, so elevation is derivable for nearly all of them.
The motivating question — "all the species of *Bombus* above 1700 m" — is today
answered from the Ecdysis arm alone, silently ignoring 28,850 community
observations. (The *filter* also mishandles the NULLs it does have; that is a
separate defect, beeatlas-yc9, and this record does not resolve it.)

## Decision

**Derive elevation from the USGS 3DEP DEM into a new `elevation_dem_m` column, for
every non-checklist coordinate, and never merge it into `elevation_m`.**

### 1. A separate column, not a `COALESCE`

`elevation_dem_m` sits beside `elevation_m` in the occurrences contract (36 → 37
columns). A DEM sample at a coordinate whose positional accuracy is up to 100 m is
uncertain in steep terrain in a way a collector's recorded elevation is not, and a
consumer deserves to know which kind of number it holds. This also keeps the
`artifacts.toml` provenance discipline intact (ADR 0002): recorded elevation is
upstream data; DEM elevation is derived and rebuildable.

Consumers that want "best available elevation" can coalesce at the point of use,
where the choice is visible. The pipeline does not make it for them.

### 2. Checklist rows are never sampled

31% of checklist rows (6,090 of 19,929) sit on **45 shared placeholder points** —
683 King County records are parked on a single coordinate in downtown Seattle. A DEM
lookup there returns the elevation of that placeholder, not of anywhere a bee was
found, and it would arrive in the same column, with the same type, as a value
derived from a real coordinate. Nothing downstream could tell them apart.

Three mechanisms enforce this, because any one of them is easy to undo by accident:

- `data/dem_elevation.py` omits `checklist_data` from `_SEED_SOURCES`, so the
  coordinates are never sampled;
- `marts/occurrences.sql` refuses the join for `record_type = 'checklist'` — needed
  independently, because a placeholder point can *coincide* with a real
  non-checklist coordinate, in which case the lookup row exists and would join;
- `assert_no_dem_elevation_for_checklist` fails the build (severity `error`) if a
  checklist row ever carries one.

The consequence is deliberate and permanent: checklist occurrences have **no**
elevation, recorded or derived. Overall coverage therefore rises from 45% to ~80%
of all occurrences — ~100% of the non-checklist ones — and not to 100%.

### 3. USGS 3DEP, 1 arc-second, read as remote COGs

Public domain, no redistribution restriction on derived values, served as Cloud
Optimized GeoTIFFs from the public `prd-tnm` S3 bucket. GDAL's `/vsicurl` driver
range-requests only the 512×512 blocks the points fall in, so no multi-GB raster
ever enters the content-addressed graph — the bead's explicit constraint that the
raster must not become a hashed task input.

**1 arc-second (~30 m), not 1/3 arc-second (~10 m).** Validated against the 6,094
distinct coordinates that carry a recorded Ecdysis elevation:

| | median \|diff\| | ≤10 m | ≤30 m | nodata | 1700 m threshold flips |
|---|---|---|---|---|---|
| 1 arc-second | 3 m | 88.2% | 99.8% | 0 | 3 / 6,094 (0.05%) |
| 1/3 arc-second | 3 m | 89.2% | 99.9% | 0 | 2 / 6,094 (0.03%) |

The residual is dominated by the recorded values' own rounding, not by the DEM.
1/3 arc-second triples the blocks fetched (2,890 vs 907) to chase noise below that
floor.

### 4. The lookup is a growing cache, keyed by coordinate

`dem_data.elevations` maps `(lat, lon)` rounded to 6 decimal places → elevation. A
coordinate is sampled **once** and never re-read, so the first build pays for ~34k
points (~30 s) and a nightly pays for the day's new observations. Failures are
distinguished, which is why the step probes each tile with `HEAD` before opening it:

- **404** → recorded as `status='no_tile'`. Permanent (a coordinate in British
  Columbia, a point offshore); asked once, never again.
- **timeout / 5xx** → recorded as *nothing*. Transient; the coordinate stays
  unsampled and the next run retries it.

Recording a transient failure would poison the cache permanently. A USGS outage
degrades to "today's new coordinates have no DEM elevation yet", never to "the
lookup is gone".

The step is a Stelis **`'boundary`** node, not a `'transform`. It reaches outside
the build for data, and a boundary always runs — which is what lets a deferred tile
self-heal. Under `'transform`, a build whose inputs hadn't changed would skip the
step and strand the deferred coordinates until the sources happened to move.

## Consequences

- The occurrences contract goes 36 → 37 columns. Per
  `project_occurrences_contract_release_sequence`, the first nightly after this
  ships fails `test_occurrences_schema_matches` against the still-old published
  parquet, and needs the documented one-time
  `SKIP_INTEGRATION_GATE=1 bash data/nightly.sh`.
- The graph gains a `dem-elevation` → `dbt-build` edge (via the `dem_elevations`
  artifact in `dbt-build`'s `#:inputs`). Declared as an edge, never as an assumption
  about task-list order — the same discipline the `ecdysis`→`checklist` edge exists
  to enforce.
- `data/pyproject.toml` gains `rasterio` (which bundles GDAL).
- `(lat, lon)` is the lookup's primary key, held by Python rather than by a DuckDB
  constraint, and `marts/occurrences.sql` LEFT JOINs on it — so a duplicate would fan
  the mart out silently. `assert_dem_lookup_coordinate_unique` is the enforcement
  (severity `error`); nothing else in the build would catch it, since
  `test_no_duplicate_occ_ids` is `warn` and the row-count gate is a ±2–5% band.
- `test_dem_elevation_coverage` warns (not errors) when non-checklist coverage falls
  below 95%. `_SEED_SOURCES` is a hand-maintained mirror of `int_combined`'s arms and
  **was already wrong once during development** — ARM 2 and ARM 1's `COALESCE`
  fallback read coordinates from `inaturalist_data.observations`, not from the WABA
  schema the arm names suggest. A sixth arm, or a repointed source, would silently
  stop being covered; this test is what makes that visible.

## Rejected alternatives

- **`COALESCE(elevation_m, elevation_dem_m)` into one column.** Loses the
  distinction between a measured value and an inferred one at the exact moment a
  user reads it as a presence claim. Rejected as the bead's second constraint.
- **Backfilling checklist rows too.** Would raise coverage to ~100% by fabricating
  elevations for 45 placeholder points covering 6,090 records. See §2.
- **A network elevation API (Open-Meteo, USGS EPQS).** Simpler — no GDAL dependency
  — but makes every build depend on a third-party service's availability and rate
  limits for data that is a static raster, and the coarsest of them (Copernicus
  GLO-90) is 3× the cell size of the 3DEP tier we rejected as *unnecessarily fine*.
- **Downloading a WA-clipped raster to disk.** ~2 GB at 1 arc-second, and it buys
  nothing over range reads: the sampling is one-time per coordinate either way, and
  a local raster is a large mutable blob the graph would have to either hash (slow)
  or deliberately ignore (a silent dependency).
- **Seeding coordinates from the previous build's `occurrences.parquet`.** The
  obvious way to avoid hand-mirroring `int_combined`'s arms, but `occurrences.parquet`
  is produced *downstream* of this step. It would be a cycle in the graph, resolved
  only by silently reading yesterday's artifact — a temporal dependency Stelis cannot
  see and cannot invalidate.

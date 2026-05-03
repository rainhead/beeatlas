# WA Bee Checklist

Provenance and format documentation for `wa_bee_checklist.tsv`.

## Source

Bartholomew, C. S., D. R. Smith, B. A. K. Sykes, and S. Reichard. 2024. "An updated checklist of the bees (Hymenoptera: Apoidea: Anthophila) of Washington State." *Journal of Hymenoptera Research* 97: 129013. [https://doi.org/10.3897/jhr.97.129013](https://doi.org/10.3897/jhr.97.129013)

## File format

| Property | Value |
|----------|-------|
| Filename | `wa_bee_checklist.tsv` |
| Encoding | UTF-8 |
| Delimiter | tab (`\t`) |
| Total lines | 2,862 (1 header + 2,861 data) |
| Header row | 1 (`species\tcounty`) |
| Data rows | 2,861 (one row per (species, county) pair) |
| Unique species | ~527 |
| Unique counties | 39 |

Columns:

- **`species`** — bare binomial, e.g. `Andrena cressonii`. No authority strings.
- **`county`** — Washington county name, e.g. `King`. Plain spelling, no `County` suffix.

## Extraction

The TSV was manually extracted from the published supplement PDF (`~/Downloads/Washington's Bees(1).pdf`, retained locally for reference; not committed). The supplement is a tabular checklist (one row per species, columns per county); the manual extraction step transformed it into long format `(species, county)` pairs — one row per occurrence relationship.

## Loaded by

`data/checklist_pipeline.py::load_checklist()` (Phase 76 / CHECK-02) reads this file and writes `checklist_data.species` (DISTINCT species, 10-column schema per CHECK-03) and `checklist_data.species_counties` (raw `(scientificName, county)` rows preserved for forward-compatible "expected counties" use).

## Status convention

v3.2 populates `status='verified'` for every row (per Phase 76 D-02): the TSV represents verified WA county records. The `'likely-to-occur'` enum value is reserved for v3.3+ when a curated "expected but not yet found" set is introduced. v3.2 does not produce any `likely-to-occur` rows.

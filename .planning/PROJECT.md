# Washington Bee Atlas

## What This Is

An interactive web map displaying arthropod specimen records from Ecdysis (a Symbiota collections portal) alongside iNaturalist host plant observations, built for volunteer collectors participating in the Washington Bee Atlas. The site is a static frontend that reads Parquet data files directly in the browser — no server required at runtime.

## Core Value

Collectors can see where bees have been collected and where target host plants are distributed, enabling informed planning of future collecting events.

## Requirements

### Validated

- ✓ Interactive map renders Ecdysis specimen points using OpenLayers — existing
- ✓ Client-side Parquet reading via hyparquet (no server needed at runtime) — existing
- ✓ Python pipeline reads Ecdysis DarwinCore export and produces Parquet — existing (partially broken)

### Active

**Data Pipeline:**
- [ ] Ecdysis download script (`data/ecdysis/download.py`) runs end-to-end with `db=164` parameter
- [ ] Occurrences processor (`data/ecdysis/occurrences.py`) produces valid Parquet without debug artifacts
- [ ] Host plant data from iNaturalist included in Parquet output

**Infrastructure:**
- [ ] AWS infrastructure (S3 bucket + CloudFront distribution) defined in CDK (`infra/`)
- [ ] GitHub Actions workflow: build on all pushes, deploy to S3 + CloudFront on push to main

**Map Features:**
- [ ] Filter specimens by taxon (species, genus, or family)
- [ ] Filter specimens by date range
- [ ] Click a specimen point to see sample details (species, collector, date, host plant)
- [ ] Host plant distribution layer showing iNaturalist observations
- [ ] Search / navigate to a location

### Out of Scope

- Multi-database support — only `db=164` (Ecdysis) is needed
- Server-side API or database — static files only
- GBIF, OSU Museum, and other experimental data sources — existing experiments only
- User authentication — public site, no accounts

## Context

- The data directory contains experiments with multiple data sources (GBIF, OSU Museum, iNaturalist, Ecdysis). The active work is `data/ecdysis/` and the `frontend/`.
- The data pipeline currently has two bugs: a `pdb.set_trace()` in `occurrences.py:to_parquet()`, and the `__main__` block references an undefined `zip` variable. The `download.py` main block also doesn't call `make_dump`.
- Reference project for S3/CloudFront deploy pattern: github.com/salish-sea/salishsea-io (uses OIDC role assumption, `aws s3 sync` + CloudFront invalidation)
- Python tooling: `uv` for package management, `pyproject.toml` in `data/`
- Each specimen record belongs to a "sample" identified by collector + date + place + host plant; sample context is important for understanding the collected bee

## Constraints

- **Static hosting**: No server runtime — all data must be in static Parquet files bundled with or fetched by the frontend
- **Python version**: 3.14+ (per `data/pyproject.toml`)
- **Node.js**: Version pinned in `package.json`
- **AWS**: Infrastructure via CDK in `infra/`; deploy via OIDC role (not long-lived access keys)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Parquet as frontend data format | Enables browser-side filtering without a server; hyparquet reads it client-side | — Pending |
| CDK for AWS infrastructure | User preference; keeps infra as code alongside the project | — Pending |
| OIDC for GitHub Actions AWS auth | No long-lived secrets; matches reference project pattern | — Pending |
| iNaturalist data in same Parquet | Keep build simple; one file contains both specimen + host plant data | — Pending |

---
*Last updated: 2026-02-18 after initialization*

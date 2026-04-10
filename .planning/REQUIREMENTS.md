# Requirements — v2.1 Determination Feeds

## Active Requirements

### Feed Content

- [ ] **FEED-01**: Each Atom entry includes taxon name, determiner name, specimen ID with link to Ecdysis record, collector name, and collection date
- [ ] **FEED-02**: Feed covers determinations with `modified` timestamp within last 90 days, sorted by `modified` desc; Atom `<updated>` per entry uses `modified` timestamp (required by spec)
- [ ] **FEED-03**: Feed-level `<updated>` reflects the most recent entry's `modified` timestamp; feed `<title>` describes the filter variant

### Feed Variants

- [ ] **FEED-04**: Unfiltered feed at `/data/feeds/determinations.xml` — all recent determinations
- [ ] **FEED-05**: Per-collector feeds at `/data/feeds/collector-{slug}.xml` — one file per unique collector with determinations in the 90-day window
- [ ] **FEED-06**: Per-genus feeds at `/data/feeds/genus-{slug}.xml` — one file per unique genus with determinations in the window
- [ ] **FEED-07**: Per-county feeds at `/data/feeds/county-{slug}.xml` — one file per unique county
- [ ] **FEED-08**: Per-ecoregion feeds at `/data/feeds/ecoregion-{slug}.xml` — one file per unique ecoregion

### Pipeline Integration

- [ ] **PIPE-01**: `data/feeds.py` module generates all Atom XML files from beeatlas.duckdb; called by `run.py` after the export step
- [ ] **PIPE-02**: Feed XML files written to `frontend/public/data/feeds/` and uploaded to S3 by `nightly.sh` alongside parquet files
- [ ] **PIPE-03**: `/data/feeds/index.json` lists all generated feed URLs with title, filter type, and entry count

### Frontend Discovery

- [ ] **DISC-01**: `<link rel="alternate" type="application/atom+xml">` autodiscovery tag added to `index.html` pointing to the unfiltered determinations feed

## Future Requirements

- TAB-01: Determinations (identifications) for my specimens listed by recency — requires iNat determination data in pipeline (distinct from Ecdysis determinations)
- TAB-02: Specimens collected last season on land owned by a named organization — requires land ownership data source
- TAB-03: Common floral hosts by month and region — cross-table aggregation query on ecdysis data

## Out of Scope

| Feature | Reason |
|---------|--------|
| Per-species feeds | Genus-level covers the use case; species granularity creates too many files |
| Per-collector discovery UI | Feed index.json covers programmatic discovery; UI listing deferred |
| Atom feed for iNat samples | iNat observations don't have determination workflow; out of scope for this milestone |
| Server-side feed filtering | Static hosting constraint — each filter variant is its own file |

## Traceability

*Filled by roadmapper*

| REQ-ID | Phase | Plan |
|--------|-------|------|
| FEED-01 | — | — |
| FEED-02 | — | — |
| FEED-03 | — | — |
| FEED-04 | — | — |
| FEED-05 | — | — |
| FEED-06 | — | — |
| FEED-07 | — | — |
| FEED-08 | — | — |
| PIPE-01 | — | — |
| PIPE-02 | — | — |
| PIPE-03 | — | — |
| DISC-01 | — | — |

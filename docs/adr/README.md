# Architecture Decision Records

Decisions with rationale and rejected alternatives. Add a new numbered record when a decision is made; mark superseded records rather than deleting them. `0003+` were retro-recorded from the retrospective (preserved at [../history/RETROSPECTIVE.md](../history/RETROSPECTIVE.md)) during the 2026-07 GSD migration.

| # | Decision | Status |
|---|----------|--------|
| [0001](0001-mapbox-basemap-cache.md) | Mapbox basemap SW cache (licensing analysis) | Accepted |
| [0002](0002-derived-vs-authoritative-artifacts.md) | Derived vs authoritative artifacts — schema-evolution regimes | Accepted |
| [0003](0003-client-query-engine-wa-sqlite.md) | Client query engine: wa-sqlite + hyparquet (DuckDB-WASM rejected) | Accepted |
| [0004](0004-prebuilt-sqlite-artifact.md) | Prebuilt SQLite artifact + `geo_blob` (WASM→JS callback cliff) | Accepted |
| [0005](0005-dbt-sole-transform-producer.md) | dbt-duckdb is the sole transform producer (contracts as gates) | Accepted |
| [0006](0006-many-to-many-place-model.md) | Many-to-many place model (`occurrence_places` bridge) | Accepted |
| [0007](0007-pipeline-runs-as-maderas-cron.md) | Pipeline runs as a maderas cron, not AWS Lambda | Accepted |
| [0008](0008-full-dbt-rebuilds.md) | Full dbt rebuilds (incremental rejected) | Accepted |
| [0009](0009-build-time-only-external-authority.md) | Build-time-only external authority (static invariant) | Accepted |
| [0010](0010-curator-gated-audit-csv-integrity.md) | Curator-gated audit-CSV data-integrity policy | Accepted |
| [0011](0011-bloom-phenology-ingest.md) | Bloom-phenology ingest — sampled, dual-cadence, static aggregates | Proposed |
| [0012](0012-wilderness-no-collect-overlay.md) | Wilderness no-collect overlay (PAD-US regions) | Accepted |
| [0013](0013-event-driven-incremental-notes-publish.md) | Event-driven incremental notes publish (contributions live in seconds) | Accepted |

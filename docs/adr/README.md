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
| [0014](0014-species-page-information-hierarchy.md) | Species page information hierarchy (sample-size count supersedes stars) | Accepted |
| [0015](0015-dem-derived-elevation.md) | DEM-derived elevation is a separate column; checklist rows never get one | Accepted |
| [0016](0016-vite-backend-integration.md) | Vite builds the app, Eleventy the HTML, meeting at a manifest | Accepted |
| [0017](0017-scoped-note-render.md) | A note publish renders the species it touched, over a receipted full build | Accepted |
| [0018](0018-coalescing-publish-queue.md) | Concurrent note writes share a build instead of queueing one each | Accepted |
| [0019](0019-bundle-reuse-gate.md) | A build reuses the app bundle when its inputs are unchanged — and must then fake being a build | Accepted |
| [0020](0020-catalog-lookup-selects-and-filters-yield.md) | A label-number lookup is a selection, and an active filter yields to it | Accepted (placement superseded by 0021) |
| [0021](0021-search-is-a-header-affordance.md) | Search is a header affordance, and one query field serves every kind of thing | Accepted |

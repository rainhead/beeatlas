# Architecture Decision Records

Decisions with rationale and rejected alternatives. Add a new numbered record when a decision is made; mark superseded records rather than deleting them. `0003+` were retro-recorded from the retrospective (preserved at [../history/RETROSPECTIVE.md](../history/RETROSPECTIVE.md)) during the 2026-07 GSD migration.

| # | Decision | Status |
|---|----------|--------|
| [0001](0001-mapbox-basemap-cache.md) | Mapbox basemap SW cache (licensing analysis) | Superseded by [0026](0026-self-hosted-basemap.md) |
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
| [0022](0022-a-swatch-is-a-legend-for-dots.md) | A swatch is a legend for dots, so a species earns a hue by plotting | Accepted |
| [0023](0023-ecdysis-change-probe.md) | The Ecdysis loader asks whether the source moved before paying to rebuild it | Accepted |
| [0024](0024-compression-is-a-build-artifact.md) | The database is compressed by the build, not by the server | Accepted |
| [0025](0025-offline-basemap-is-a-byte-store.md) | The offline basemap is a byte store the page reads, not something the SW serves | Accepted |
| [0026](0026-self-hosted-basemap.md) | The basemap is ours — MapLibre over a self-hosted Protomaps extract | Accepted |
| [0027](0027-identity-survives-going-offline.md) | Identity survives going offline, and an unverified identity is still an identity | Accepted |
| [0028](0028-a-search-result-is-a-record-or-a-view.md) | A search result names a record or a view — a record is selected, a view is filtered | Accepted |
| [0029](0029-one-origin-two-surfaces.md) | The app moves to the root, and offline stops at the map | Proposed |
| [0030](0030-what-a-species-is-vs-what-to-ask-inat.md) | What a species *is* and what we *ask iNat about* are two different taxon IDs | Accepted |
| [0031](0031-a-species-photo-is-a-reference-not-a-prize.md) | A species photo is a reference image, not a prize-winner | Accepted |
| [0032](0032-species-universe-includes-expert-identified-observations.md) | The species universe includes expert-identified observations | Accepted |
| [0033](0033-trust-an-expert-unless-an-expert-disagrees.md) | Determination trust: trust an expert, unless an expert disagrees | Accepted |
| [0034](0034-occurrence-trust-stays-a-separate-artifact.md) | occurrence_trust stays a separate artifact | Accepted |
| [0035](0035-level-iv-ecoregions-are-places.md) | Level IV ecoregions are places, not a second ecoregion column | Accepted |

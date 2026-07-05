# BeeAtlas — Product

## What This Is

BeeAtlas is an interactive web atlas of Washington bee occurrence data, built for the volunteer collectors of the **Washington Bee Atlas (WABA)** project. It integrates Ecdysis specimen records, iNaturalist observations, and the Bartholomew et al. 2024 state checklist onto a filterable Mapbox map, with per-taxon, per-place, and per-collector pages.

**Core value:** the one place that *integrates* WABA's data and fosters community around it — something none of the alternatives do (Canvas is announcements only; iNaturalist is where the action is but "flies by too fast to notice"; Ecdysis is data CRUD with no interaction; Facebook doesn't integrate the data and is widely scorned).

## Mission

1. **Tighten learning cycles** — close the gap between "I collected this" and "it appears identified on the map." (Provisional iNat specimen records shown before Ecdysis ingestion are the most direct expression of this.)
2. **Convey liveness and togetherness** — volunteers should feel part of something active and shared, not depositing data into a void.
3. **Long-term: become the gathering place** for the Washington Bee Atlas.

Full framing: [docs/product/project-goals.md](docs/product/project-goals.md).

## The Two Halves

The product organizes around two orthogonal surfaces (see [docs/product/two-halves.md](docs/product/two-halves.md)):

- **Learning half** (retrospective / reference) — "what is this bee, what's out there, what's been found." Central object is the **taxon**; occurrences are evidence. Runs entirely on existing data. **Mostly built** (taxon/genus/species pages, traits, checklist).
- **Work half** (prospective / personal) — "what have I contributed, where are the gaps, where do I go next." Central object is **me + places**. **Least served by any other tool → the biggest differentiation.** Key design unlock: it needs only *self-identification* (pick your iNat handle), **not authentication** — it's all public data. v6.0 shipped the first work surface (per-collector pages).

## Cold-Start Strategy

Deliver value from *existing* data first; don't build community features until people use the site semi-regularly (avoid the empty-platform problem). Meanwhile, surface external community activity (iNat comments, determination feeds) to convey presence without requiring on-site participation.

## Capabilities (built)

- Filterable Mapbox map of all WA bee occurrences, integrating five source arms into one model (see [CONTEXT.md](CONTEXT.md) and [docs/domain-model.md](docs/domain-model.md)).
- Per-taxon, per-genus, per-species pages with traits and checklist status.
- Per-place and per-collector pages (the first "work half" surface — self-identification by iNat handle, no auth).
- Provisional iNat specimen/sample records shown on the map before Ecdysis ingestion (tightens the learning cycle).
- Community notes on public entity pages, via an authoritative write layer (v8.0) with allowlist-gated authoring and curator takedown.

## Requirements & History

BeeAtlas has shipped 40+ milestones (v1.0, 2026-02-22 → v8.0, in progress). Per-milestone requirement sets are archived in git history; the enduring product capabilities are the list above. The most recent milestone, **v8.0 Authoritative Data Foundation**, added the live write layer (`api.beeatlas.net`) and community notes.

## Future Directions (unscheduled)

Tracked as beads issues; the durable directions:

- **Work-half surfaces** — "me & my progress" personal work surface (temporal event-stream vs watermark design fork open); "where to go next" collection-planning (gaps × access × floral bloom); collection-event coordination (deferred until semi-regular users exist).
- **Learning-half enrichment** — seasonality/phenology charts on taxon pages; trait-based map filtering.
- **Data foundation** — federal wilderness areas as regions (next up); iNat taxonomy via monthly DwC-A download (kill rate-limit risk).
- **Notes maturation** — moderation queue, public flagging, edit history/revert, closing the guest-freshness gap.
- **Multi-state expansion** — the long-horizon scaling driver; would push the dataset past 500K rows and force a pre-filter-per-state or server-API path (see the scaling ceiling in [docs/concerns.md](docs/concerns.md)).

## Out of Scope

- **Authentication for the work half** — self-identification by iNat handle is sufficient; the work surfaces run on public data. (Auth exists only for the isolated v8.0 write side.)
- **Server runtime on the read path** — the atlas is static; the write layer is a deliberate, isolated exception (see [CLAUDE.md](CLAUDE.md) Constraints).
- **Speculative generality** — a second authoritative table / generalized migration framework is deliberately *not* built until a second use case exists.

## Constraints

- **Frontend:** TypeScript, Mapbox GL JS, Lit web components, wa-sqlite + hyparquet (client-side query engine), 11ty over Vite. No data bundled with the build — artifacts fetched from CloudFront at runtime.
- **Pipeline:** dbt-duckdb transforms; `run.py` orchestrator; nightly cron on the `maderas` server (`data/nightly.sh`); publishes to S3 + CloudFront. Python 3.14+.
- **Write layer:** SQLite on maderas + a small Flask/WSGI API (Waitress behind Apache) at `api.beeatlas.net` — the one server-runtime exception.
- **Infra:** AWS via CDK (`infra/`), deployed via GitHub OIDC.

## Decisions

Product and technical decisions with rationale live in [docs/adr/](docs/adr/). Domain language: [CONTEXT.md](CONTEXT.md). Engineering lessons: [docs/lessons-learned.md](docs/lessons-learned.md).

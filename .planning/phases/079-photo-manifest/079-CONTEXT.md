# Phase 79: Photo Manifest — Context

**Gathered:** 2026-05-04
**Status:** Pre-planning — context captured before research/planning
**Source:** /gsd-discuss-phase 79

<domain>
## Phase Boundary

A hand-edited TOML photo manifest at `content/species-photos.toml` is in place with required-field and license-whitelist validation wired into the build, plus a one-shot helper to seed it. The build never pulls iNat; seed runs out-of-band.

Specifically: the phase delivers `content/species-photos.toml` (initially seeded), `scripts/validate-species.mjs` (build-chain gate), `scripts/seed-species-photos.mjs` (one-shot helper, NOT in CI), Vitest coverage in `src/tests/`, and the `npm run build` chain extended to run `validate-species` after `validate-schema` and before `eleventy`.

Phase 79 produces no consumed-at-runtime artifact other than the TOML; downstream Phase 80 (Page Scaffolding) is the first reader, via Eleventy `_data/photos.js` parsing the TOML with `@iarna/toml`.

</domain>

<decisions>
## Implementation Decisions

### D-01 Seed write policy: fill-only, never overwrite [LOCKED]
`scripts/seed-species-photos.mjs` only adds entries for species whose `[species."<scientificName>"]` table does not yet exist in the TOML. Existing tables — including their `description` field, `[[photos]]` array, captions, ordering, and any human-added fields — are never modified. Re-runs are safe and idempotent at the table-key level: humans always win.

The seed treats the TOML as authoritative for any species it has touched. New species (added later by Phase 78's pipeline) get starter content automatically; no human work is at risk from a re-run.

### D-02 Manifest scope: all species in species.json (~735) [LOCKED]
Seed iterates every species present in `public/data/species.json` (the Phase 78 species feed), including checklist-only species with no iNat occurrences. Species with no usable iNat photos get a table with no `[[photos]]` array (or an empty one) and an empty `description`; humans fill these in by hand later, possibly with non-WABA CC-licensed photos.

Rationale: the manifest is the canonical place to author per-species content (including descriptions). Writing every species up-front gives humans a single starting point and avoids "missing species" surprises when the page scaffolding lands in Phase 80.

### D-03 Photo selection heuristic: top 3 research-grade by faves, WA preferred [LOCKED]
For each species, query iNat `/v1/observations?taxon_id=<id>&quality_grade=research&order_by=votes`. Prefer observations in Washington (`place_id` for WA); fall back to global results to fill the slot if fewer than 3 WA candidates pass the license filter. Final manifest entry carries 0–3 photos per species.

Skip photos whose `license_code` is null, `all-rights-reserved`, or outside the PHOTO-02 whitelist (`{cc0, cc-by, cc-by-nc, cc-by-sa, cc-by-nc-sa}`). The seed itself enforces the license whitelist at write time so the validator's later check is redundant for seeded entries (humans editing by hand are the validator's primary audience).

`taxon_id` resolution: prefer the iNat taxon_id already present in `taxon_lineage_extended` (Phase 77 lineage-bridge work) so the seed does not perform a name → taxon_id search itself.

### D-04 Test runtime: Vitest in src/tests/ [LOCKED]
Validator tests live at `src/tests/validate-species.test.ts`. Tests import the validator's exported functions (validate-species.mjs must expose its core function, not just have CLI side-effects on import) and assert behavior on fixture TOMLs with bad licenses, missing attribution for non-CC0 photos, and unknown scientificNames (warn-only). Subprocess-based assertions are acceptable for the build-chain integration test (success criterion 3) but should be the exception.

Rationale: validator is a Node script; Vitest is the natural fit and matches the existing `src/tests/arch.test.ts` pattern of in-process source-file analysis. No new Node-from-Python coupling.

### Claude's Discretion
- Exact validator API surface (single `validateSpeciesPhotos(toml, speciesJson)` function vs. multiple smaller exports — planner picks)
- Error message format and which line numbers the validator surfaces
- Seed CLI flags beyond defaults (e.g., `--dry-run`, `--limit N` for partial runs are fine to add)
- Exact iNat fallback sequence when WA returns <3: top up from global, or just take what WA has — researcher to confirm what produces fewer "no photo" gaps in practice
- Rate-limiter implementation (custom delay vs. p-limit vs. native setTimeout chain — anything that holds ≤1 req/sec)
- Fixture-TOML location under `src/tests/fixtures/` or inline string literals
- Whether seed writes empty `[[photos]] = []` array or omits the array entirely for species with no photos (TOML round-trip equivalent — pick whichever `@iarna/toml` produces cleanly)
- Whether `description` is omitted or written as empty string `description = ""` (same — pick whichever validates cleanly with the optional-field rule from PHOTO-01)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Specs and requirements
- `.planning/ROADMAP.md` — Phase 79 success criteria (5 items)
- `.planning/REQUIREMENTS.md` — PHOTO-01..PHOTO-08 (verbatim contract)
- `.planning/seeds/species-tab.md` — original v3.2 scoping; "Photos via TOML manifest checked into repo, no build-time queries" decision
- `.planning/PROJECT.md` — milestone v3.2 Species Tab framing

### Existing patterns to mirror
- `scripts/validate-schema.mjs` — Node validator + build-chain gate pattern; validate-species.mjs follows the same shape (CLI exits nonzero on error, exported function for in-process testing)
- `src/tests/arch.test.ts` — Vitest source-analysis pattern (readFileSync against repo files); validate-species.test.ts follows similar shape but reads fixture TOMLs
- `data/feeds.py::_slugify` — slug helper if seed needs to derive any filenames (not expected — TOML keys use raw scientificName)

### Upstream artifact (Phase 78 output)
- `public/data/species.json` — validator and seed's source of truth for which species exist; column shape locked by Phase 78 success criteria
- `public/data/species.parquet` — same data; not read directly by Phase 79 (validator and seed prefer the JSON form for HMR + Node-friendliness, mirroring Phase 80 Pitfall #8)

### Library locks
- `@iarna/toml` — TOML parse/stringify in both validator and seed; matches Phase 80 success criterion 1 ("`_data/photos.js` reads `content/species-photos.toml` via `@iarna/toml`"). Add to `dependencies` (validator runs in build chain), not `devDependencies`.

### External APIs
- iNat API `/v1/observations` — seed only; documented at api.inaturalist.org/v1/docs/. Rate limit ≤1 req/sec per PHOTO-07.
- iNat taxon_id values resolvable from `data/beeatlas.duckdb` table `taxon_lineage_extended` (Phase 77 bridge population). Seed reads taxon_ids from there to avoid an iNat name-lookup round trip.

### Downstream consumer (forthcoming)
- Phase 80 `_pages/species.njk` + `_data/photos.js` — first reader of the TOML; informs validator-error wording and seed's per-species output shape

</canonical_refs>

<specifics>
## Specific Ideas

- License whitelist values map 1:1 to iNat `license_code` strings — no normalization needed
- WA `place_id` on iNat: 46 (verified in current pipeline use)
- Phase 78 produces `public/data/species.json` with ~556 occurrence-bearing species + ~179 checklist-only = ~735 total (per 078-CONTEXT.md specifics; live count to confirm during seed run)
- Largest subgenus: Osmia/Andrena ~80 species each (per Phase 80 Pitfall #10) — seed throughput at 1 req/sec on ~735 species ≈ 12 minutes wall-clock; acceptable for a one-shot helper
- `attribution` rendered "verbatim adjacent to the photo (never innerHTML)" per PHOTO-03 — seed should write attribution as iNat returns it (`(c) <user>, some rights reserved (CC-BY)` or similar) so renderers can show the literal string
- PHOTO-04 explicitly bars URL construction at render time — seed MUST resolve the photo URL from iNat API (`photo.url` field, large size) and store it verbatim in TOML

</specifics>

<deferred>
## Deferred Ideas

- Comment preservation across seed re-runs — `@iarna/toml` is lossy on comments; D-01's fill-only policy sidesteps this by never re-writing existing tables, so comment loss is not a concern in practice. Revisit only if the seed grows a "refresh photos for one species" flag.
- Per-species photo count tuning (currently top-3) — humans can edit down by deleting `[[photos]]` entries; revisit if 3 turns out to be wrong on average.
- Seed CLI flag `--refresh <scientificName>` to re-pull photos for a single species, bypassing fill-only — defer until a concrete need surfaces; D-01 is intentionally strict to start.
- Auto-rotation of photos based on community votes over time — out of scope; manual editing is the workflow.
- Non-iNat photo sources (institutional photo archives, project Flickr pools) — humans add these by hand to the TOML; seed only knows iNat.

</deferred>

---

*Phase: 079-photo-manifest*
*Context captured 2026-05-04 via /gsd-discuss-phase 79*

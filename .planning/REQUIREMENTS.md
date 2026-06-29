# Requirements: v7.0 Species Trait Annotations

Scope: annotate bee species with curated ecological traits and surface them on the site.
Phase 173 (data layer) shipped ad-hoc before this milestone was formalized; its requirements
are recorded here as **satisfied** for provenance. Phase 174 (integration) is the active work.

## v1 Requirements

### Trait Data Layer — satisfied by Phase 173

- [x] **TRAIT-DATA-01**: A `species_traits` mart, keyed on `canonical_name`, provides per-species sociality (social / solitary / cleptoparasitic), diet breadth (generalist / specialist) with host plant family for specialists, nesting biology, native/introduced status, and the host bee(s) of cuckoos.
- [x] **TRAIT-DATA-02**: Every surfaced trait carries a provenance/source value (`*_source`: e.g. `beegap-species`, `genus-backbone`, `fowler`) so confidence can be judged downstream.
- [x] **TRAIT-DATA-03**: Trait labels are assembled from committed, license-clean dbt seeds (USGS Bee-Gap 2017 public domain; Fowler & Droege Western specialists; a conservative genus-level sociality/nesting backbone; Bee-Gap cuckoo hosts) with all join keys routed through `int_synonyms` so curated synonyms bridge trait data.

### Trait Surfacing — Phase 174 (active)

- [ ] **TRAIT-UI-01**: The species detail page displays the species' available traits — sociality, diet breadth (with host plant family for specialists), nesting, and native status — and omits traits with no data rather than showing blanks.
- [ ] **TRAIT-UI-02**: Cleptoparasitic species show their recorded host bee(s) on the detail page.
- [ ] **TRAIT-UI-03**: The species list/index surfaces trait labels (e.g. badges or columns) so traits are scannable without opening each species.
- [ ] **TRAIT-UI-04**: Each surfaced trait exposes its provenance/source (e.g. via tooltip) so a user can tell a species-level label from a genus-backbone or Fowler-derived one.
- [ ] **TRAIT-UI-05**: Trait data reaches the frontend via the established `species.json` fetch-at-build pattern (S3 + manifest + deploy.yml) — no pipeline-regenerated artifacts committed, static hosting preserved.

## Future Requirements (deferred)

- Trait-based **map filtering** (e.g. show only cuckoos / specialists / ground-nesters) — deferred; requires adding FilterState dimensions, style-cache bypass, and URL params.
- Derive the ~33 unrecorded *Sphecodes*/*Stelis* cuckoo hosts from **GloBI / Big-Bee interaction data**.
- Backfill sparse **native/introduced** coverage (currently ~44%).

## Out of Scope

- Surfacing raw interaction records or a host-plant network view (this milestone is per-species labels, not relationships).
- Editing/curation UI for traits (seeds are curated in-repo, not via the site).

## Traceability

| Requirement | Phase |
|-------------|-------|
| TRAIT-DATA-01, -02, -03 | 173 (complete) |
| TRAIT-UI-01 … -05 | 174 |

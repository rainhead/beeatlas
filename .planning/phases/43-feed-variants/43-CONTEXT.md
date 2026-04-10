# Phase 43: Feed Variants - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Generate four variant feed families from `beeatlas.duckdb` and write them to `frontend/public/data/feeds/`. One file per unique collector, genus, county, and ecoregion that has determinations in the 90-day window (plus an index.json listing all generated feeds). The main `determinations.xml` feed from Phase 42 is not modified.

</domain>

<decisions>
## Implementation Decisions

### Empty variant behavior
- **D-01:** Write a variant feed file even when 0 entries match the 90-day window — do not skip
- **D-02:** For empty feeds, use pipeline run time (`datetime.now(tz=UTC)`) as the feed-level `<updated>` timestamp
- **D-03:** Empty feeds are valid Atom: feed element + title + id + self-link + updated, zero `<entry>` children
- **D-04:** index.json includes empty feeds with `entry_count: 0`

### Claude's Discretion
- Slug generation algorithm (standard: lowercase, spaces/underscores → hyphens, strip non-ASCII or transliterate)
- Slug collision policy (reasonable default: append a numeric suffix or log a warning)
- Code organization within feeds.py (one generic writer vs per-type functions)
- Exact index.json field names beyond title, filter_type, and entry_count
- Whether index.json includes the main determinations.xml or only variant feeds

</decisions>

<specifics>
## Specific Ideas

No specific requirements stated — open to standard approaches for slugification and index structure.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

No external specs — requirements are fully captured in REQUIREMENTS.md and the decisions above.

### Phase requirements
- `.planning/REQUIREMENTS.md` — FEED-05, FEED-06, FEED-07, FEED-08, PIPE-03 define the variant file paths, filter semantics, and index.json requirements
- `.planning/ROADMAP.md` §Phase 43 — Success criteria (four feed families + index.json)

### Existing implementation to extend
- `data/feeds.py` — Phase 42 implementation: `write_determinations_feed`, `_build_entry`, `_atom`, Atom namespace setup, DB_PATH/ASSETS_DIR constants — variant writers should follow this pattern
- `data/tests/test_feeds.py` — Existing test patterns; variant tests should extend this file or a sibling

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `write_determinations_feed(con, out_dir)` — established signature; variant writers should match it
- `_build_entry(feed, row)` — shared entry-builder; reuse unchanged (entry content is the same across all feed types, only the parent filter differs)
- `_atom(tag)` — Clark-notation helper; shared across all writers
- `_QUERY` SQL pattern — variant queries add a `WHERE {filter_col} = ?` clause; join structure is identical

### Established Patterns
- DuckDB connection opened in `main()`, passed to writer functions — don't open per-writer
- `out_dir / 'feeds' / '{filename}'` path construction; `out_path.parent.mkdir(parents=True, exist_ok=True)`
- Atom self-link: `<link rel="self" href="{FEED_ID}"/>`
- Print progress line: `f"  feeds/{filename}: {len(rows):,} entries, {path.stat().st_size:,} bytes"`

### Integration Points
- `data/run.py` STEPS list — `feeds.main` is already the final step; Phase 43 extends `feeds.main()` to also call the new variant writers and write index.json
- `frontend/public/data/feeds/` directory — created by `write_determinations_feed`; variant writers write siblings into the same directory

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 43-feed-variants*
*Context gathered: 2026-04-10*

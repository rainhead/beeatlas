---
phase: 162-add-specific-hikes-as-places
fixed_at: 2026-06-23T00:00:00Z
review_path: .planning/phases/162-add-specific-hikes-as-places/162-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 162: Code Review Fix Report

**Fixed at:** 2026-06-23
**Source review:** .planning/phases/162-add-specific-hikes-as-places/162-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4 (WR-01..WR-04; critical_warning scope)
- Fixed: 4
- Skipped: 0

All fixes touch a single file, `data/add_hikes_as_places.py` (a one-time
maintainer curation script, not production runtime). The offline test suite
(`data/tests/test_add_hikes_as_places.py`, 6 tests) was green before the fixes
and stayed green after each commit. No CRS/buffer core was touched: the
`always_xy=true` 4th arg on both `ST_Transform` calls and the buffer tolerance
are unchanged; no overlap handling was added; wta.org was not reintroduced; the
snoqualmie–olallie hike remains deferred (commented out).

## Fixed Issues

### WR-01: GPX fallback path is unreachable — resolved against the wrong working directory

**Files modified:** `data/add_hikes_as_places.py`
**Commit:** cfeb2c31
**Applied fix:** Added a `REPO_ROOT = Path(__file__).parent.parent` constant
(and re-pointed `TOML_PATH` at it for consistency). In `geometry_for_hike`, the
GPX fallback now resolves `gpx_path` against `REPO_ROOT` —
`gpx_path = REPO_ROOT / hike["gpx_path"]` — so a repo-root-relative value like
`"data/fixtures/hike-gpx/geyser-valley.gpx"` resolves correctly regardless of
cwd (the script runs from `data/`, where a bare `Path(gpx_path)` checked
`data/data/...` and could never exist). The not-found GAP message now reports the
fully-resolved path. This matches the review's recommended fix.

### WR-02: OSM element lookup collides node and way ID namespaces

**Files modified:** `data/add_hikes_as_places.py`
**Commit:** c6232e85 (combined with WR-03 — see note below)
**Applied fix:** Both `osm_relation_to_linestring_wkt` and
`osm_ways_to_linestring_wkt` now build their member-lookup map from **ways only**
(`{e["id"]: e for e in elements if e.get("type") == "way"}`) instead of a flat
all-element map. With the keyspace restricted to ways, a recursed node sharing a
numeric id with a member way can no longer shadow that way on
`.get(member["ref"])`. This is the review's recommended "filter to ways before
indexing" fix, applied at both collision sites.

### WR-03: Way-concatenation does not handle reversed shared endpoints

**Files modified:** `data/add_hikes_as_places.py`
**Commit:** c6232e85 (combined with WR-02 — see note below)
**Applied fix:** Took the review's lower-risk option: `osm_relation_to_linestring_wkt`
now emits each member way as its own `MULTILINESTRING` segment instead of
concatenating ways into a single `LINESTRING`. Because no cross-way join is
performed, a member stored with reversed orientation can no longer inject a
spurious head-to-tail straight segment that `ST_Buffer` would then widen. This
aligns the relation path with the already-correct sibling
`osm_ways_to_linestring_wkt`. The function's docstring, return type, and
no-usable-segment `ValueError` were updated to match the new `MULTILINESTRING`
output. The downstream `linestring_to_corridor_wkt` consumes WKT via
`ST_GeomFromText`, which already handled `MULTILINESTRING` (the standalone-ways
path has always fed it that), so the change is transparent to the buffer core.

### WR-04: `name_pattern` is interpolated unescaped into the Overpass regex/query

**Files modified:** `data/add_hikes_as_places.py`
**Commit:** 35c093f6
**Applied fix:** In `fetch_osm_ways_by_name`, `name_pattern` is now escaped for
the Overpass QL string literal before interpolation —
`safe_pattern = name_pattern.replace("\\", "\\\\").replace('"', '\\"')` — and the
escaped value is used in both the `way[...]` and `relation[...]` clauses. Added a
docstring note clarifying that `name_pattern` is treated as a regex by Overpass,
so callers must regex-escape any metacharacters they want matched literally. This
mirrors the `_toml_escape` hardening Phase 161 added for the same
"externally-shaped string interpolated into a DSL" class.

## Notes

- **WR-02 + WR-03 share one commit (c6232e85).** Both findings are physically
  intertwined in the rewrite of `osm_relation_to_linestring_wkt` — the way-only
  index (WR-02) and the switch to per-way `MULTILINESTRING` segments (WR-03)
  touch the same contiguous block and cannot be cleanly separated. The WR-02 fix
  in `osm_ways_to_linestring_wkt` is included in the same commit as part of the
  WR-02 finding. All other findings are isolated to their own commits.

- **WR-03 also resolves Info finding IN-01's hazard partially, but not fully.**
  IN-01 flags the `osm_ways` source branch in `geometry_for_hike` (dead code with
  a broad `except Exception`) — that branch was NOT removed (it is out of scope,
  Info tier). The WR-03 rewrite did remove the old forward-only join logic, but
  the `osm_ways_to_linestring_wkt` function itself (which IN-01 does not target)
  is still reached by the `osm_name_query` path and remains live. So IN-01 is
  **not** obviated by these fixes and remains open for a future Info pass.

- **WR-02 / WR-03 geometry-assembly logic is not exercised by the offline test
  suite** (IN-05 notes this coverage gap). The fixes pass syntax and structural
  verification and the existing 6 tests stay green, but the reversed-way and
  node/way-collision paths have no direct regression test. The logic was verified
  by reasoning against the OSM/Overpass data shapes described in the review, not
  by an executing test. A human may wish to confirm the `MULTILINESTRING` output
  against a real relation response before relying on it for a future GPX-only or
  reversed-member hike.

---

_Fixed: 2026-06-23_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

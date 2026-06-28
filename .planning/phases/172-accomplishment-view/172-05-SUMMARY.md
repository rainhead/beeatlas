# 172-05 Summary — Operator UAT (blocking checkpoint)

**Plan:** 172-05 (type: checkpoint:human-verify, autonomous: false)
**Result:** ✅ PASS — operator approved 2026-06-28
**Requirements:** ACCOM-01, ACCOM-02, ACCOM-03, ACCOM-04

## What happened

Automated work (Plans 01–04) shipped the four accomplishment elements; this plan was the blocking operator visual UAT (UI hint: yes, per `feedback_uat_ui_phases` — not auto-approved despite the auto chain).

UAT round 1 surfaced five issues; all fixed in two gap-closure passes and re-approved in round 2:

| # | Issue | Fix (commit) |
|---|-------|--------------|
| 1 | Badge undercounted seasons (catalogued-only) | Aggregations switched to the `tier='atlas'` facet, incl. uncatalogued specimens — `3dc4c7c1` |
| 2 | Lowercase binomials | `genus` + `scientificName` instead of `canonical_name` — `c8aec55a` |
| 3 | Unexplained per-species `(N)` | Removed — `c8aec55a` / `2def26e6` |
| 4 | Ecoregion SVG ~1.3 MB | Aggressive simplification (now 17 KB base partial) — `c09d4c02` |
| 5 | 248 per-collector SVG files (122 MB) | Redesigned to one shared base map per type, inlined + per-collector CSS highlight, no per-collector files / no JS — `c09d4c02`, `2def26e6`, `46ea7ba9` |

## Sign-off record

`.planning/phases/172-accomplishment-view/172-HUMAN-UAT.md` — PASS, operator rainhead, tested `/collectors/rainhead/`.

## Final state

- `npm run build` clean; `pytest -m "not integration"` 281 passed; `npm test` 897 passed.
- Map delivery is now committed static base-map partials (`_includes/maps/*.svg`) + per-page CSS highlight from `collectors.json` region-name lists — no nightly S3 step for collector maps.

## Self-Check: PASS

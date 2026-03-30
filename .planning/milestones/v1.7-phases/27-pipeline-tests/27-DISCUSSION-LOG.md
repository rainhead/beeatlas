# Phase 27: Pipeline Tests — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.

**Date:** 2026-03-28
**Participants:** Peter Abrahamsen, Claude

---

## Area: Which pipeline module to cover

**Q:** What's your primary goal — catching regressions in transformation logic, or verifying the dlt write path?

**A:** Transformation logic. Would like test data covering a few different cases including nulls for optional fields.

---

## Area: Refactoring for testability

**Q:** The ecdysis HTML parsing is inline in the `occurrence_links()` generator. Should we extract it into a pure function to make it testable?

**A:** Yes, this is a great time to refactor in the interest of testability. More logic confined to pure functions is good.

---

## Area: Export test depth / ST_Distance fallback

**Q:** Should we exercise the ST_Distance fallback (specimens outside polygon boundaries) in the fixture?

**Investigation:** Queried the live DuckDB — 209 specimens miss the ST_Within join. Two main clusters:
- ~140 specimens at Hanford Reach National Monument (Columbia River boundary — genuine river polygon edge)
- ~30 specimens near Asotin County (Snake River corridor)

User asked for example occurrence numbers. Showed WSDA_2315203–2315210 (David Jennings, "near Craige", 46.139°N, -116.936°W) and WSDA_2451726+ (Hanford Reach).

User checked WSDA_2315203 in Ecdysis: specimen is on a roadside 50m from the Snake River — coordinates are correct. Investigated geographies_pipeline.py: commit 330eaf5 added 0.01° simplification (≈1 km) intended for Stats Canada coastlines but applied uniformly to US county boundaries. Root cause confirmed: oversimplified county polygons clipping inland areas near rivers.

**A:** Take the simplification bug as a follow-up item. Don't test the approximation/fallback behavior in Phase 27. Happy path only in the fixture.

---

## Area: CI integration

**A:** CI tests frontend only for now. Tests running locally is sufficient. Development should stay on local machine, not maderas (maderas is deployment only).


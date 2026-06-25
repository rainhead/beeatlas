# Open Research Questions

## ✓ RESOLVED — What does "my progress" concretely surface?

*Raised & resolved: 2026-06-24 (gsd-explore — work/learning reframe)*

**Answer: status THEN accomplishment.** Status leads (it's what pulls a volunteer back);
accomplishment is the retrospective reward they earn.

- **Status** = a **personal event stream** — the collection→ID lifecycle as a chronological feed
  ("your sample was IDed as *Agapostemon virescens*"; "new county record!"). **Personal only for
  MVP.** Maps to the "liveness" Core Value.
- **Accomplishment** = coverage map (counties or ecosystems), taxonomic breadth, and lightweight
  **badges** (years active, etc.). Maps to the "tighten learning cycles" payoff.

**Scope decisions:**
- **Community feed deferred** — a shared "*someone* near you found a *Bombus*" stream is important
  but less urgent and prerequisite-heavy; it folds into the existing
  `.planning/seeds/collection-event-coordination.md` seed, not the MVP.
- **Role badges deferred** — "instructor" and similar need identity/role data (a roster) that does
  not exist in the occurrence pipeline. Derivable badges (years active, taxonomic breadth) only for
  MVP.

### Follow-on open question — event stream needs temporal history

The event stream implies **state transitions over time**, but the nightly pipeline emits a
**snapshot**, not a change log. Design fork to resolve at discuss/plan time:
- (a) pipeline retains per-occurrence status-history / "first-appeared" timestamps, or
- (b) client diffs the snapshot against a locally-stored "last seen" watermark.

This is the part that most stresses `.planning/todos/pending/rebuild-source-into-facets.md`: the
ID-status lifecycle must be **temporal**, not just a current-state label.

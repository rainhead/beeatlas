# Phase 146: debounce URL updates when zooming and panning the map - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-09
**Phase:** 146-debounce-url-updates-when-zooming-and-panning-the-map
**Areas discussed:** Real scope (debounce already exists), What to tune, History-entry reduction mechanism

---

## Real scope — what should the phase deliver, given the debounce already exists?

Codebase scout established the 500 ms history debounce is already implemented
(`_pushUrlStateDebounced()`, `bee-atlas.ts:665-677`), so the literal backlog goal
was already met. Presented the genuine options.

| Option | Description | Selected |
|--------|-------------|----------|
| Stop history entries for pan/zoom entirely | replaceState-only; back button ignores map positions | |
| Keep behavior, add test coverage | Lock in the existing untested debounce with vitest | |
| Tune the existing debounce | Adjust the existing mechanism — specify what's wrong | ✓ |
| Close as already-done | Drop Phase 146; goal already met | |

**User's choice:** Tune the existing debounce.
**Notes:** Existing behavior is close but not right — wants an adjustment, not a teardown or a no-op.

---

## What to tune

| Option | Description | Selected |
|--------|-------------|----------|
| Too many history entries | Deliberate moves >500 ms apart each create a back-button entry; want fewer | ✓ |
| Live replaceState churn | The immediate per-moveend replaceState is the bother | |
| 500ms interval wrong | Mechanism right, timing off | |
| Both write paths | Coalesce replaceState + pushState behind one debounced commit | |

**User's choice:** Too many history entries.
**Notes:** Confirmed via code that viewport `pushState` is the *only* `pushState` in the app — all other writes are `replaceState` — so viewport is the sole source of back-button entries, which is why exploration piles them up.

---

## History-entry reduction mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Coalesce a pan/zoom session into one entry | First viewport move after a non-viewport action pushes one entry; subsequent moves replace it | ✓ |
| Lengthen the debounce only | Raise 500 ms; still one entry per pause | |
| Movement-threshold gate | Only commit when viewport changed beyond a zoom/distance threshold | |
| Coalesce + threshold | Session-coalescing plus a minimum-movement gate | |

**User's choice:** Coalesce a pan/zoom session into one entry.
**Notes:** A whole exploration session = exactly one back-button entry, delimited by meaningful (filter/selection/UI) actions. Keeps viewport reachable via back (rejected eliminating it) without a movement threshold.

---

## Claude's Discretion

- Whether the first push of a session is immediate or retains a short debounce to absorb accidental nudges (default lean: short debounce on first push, replaceState live thereafter).
- Session-flag naming and field placement; whether the existing 500 ms timer is kept, repurposed, or removed.

## Deferred Ideas

- Eliminate viewport history entries entirely (replaceState-only) — considered, rejected.
- Movement-threshold gate — considered, not chosen; possible future layer.

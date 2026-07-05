---
name: "Me and my progress" — personal work surface
description: Self-identified (no auth) personal dashboard — your samples + the collection→ID lifecycle closing in near-real-time; the biggest under-served win
type: project
trigger_condition: After the source→facets rebuild lands (rebuild-source-into-facets todo)
planted_date: 2026-06-24
---

The **biggest win** identified in the 2026-06-24 explore session, and the area **least served by
any other tool** (Canvas/iNat/Ecdysis/Facebook all fail at it). Directly realizes the Core Value
"tighten learning cycles" and "convey liveness."

**The unlock:** this needs **no authentication** — only **self-identification** (pick your iNat
handle / collector name). It's all public data; you don't have to prove who you are to be shown
what's been identified from *your* collections. The assumed auth blocker was false.

A volunteer self-identifies and sees their own slice: their samples and occurrences, attributed to
them, with the **collection → identification lifecycle** visible (what's awaiting ID, what came
back, new county records, etc.).

**Depends on** the `source`→facets rebuild — **shipped as Phase 170** (`source` decomposed into
`tier` + `record_type`; see [CONTEXT.md](../../../CONTEXT.md)). The data is now expressible as
collector-attributed occurrence–sample pairs with an ID-status lifecycle.

## Shape (resolved 2026-06-24)

**Status THEN accomplishment.**

1. **Status — a personal event stream** (the hook): the collection→ID lifecycle as a chronological
   feed ("your sample was IDed"; "new county record!"). **Personal only for MVP** — the community
   feed ("someone near you found a *Bombus*") is deferred to `collection-event-coordination.md`.
2. **Accomplishment — the reward**: coverage map (counties / ecosystems), taxonomic breadth, and
   lightweight derivable badges (years active, …). **Role badges** ("instructor") need a roster /
   identity source that doesn't exist in the pipeline → deferred.

**Design fork to resolve at plan time:** the event stream needs **temporal history**, but the
nightly pipeline emits a snapshot. Either the pipeline retains status-history / first-appeared
timestamps, or the client diffs against a locally-stored "last seen" watermark. This makes the
ID-status lifecycle in the source→facets rebuild **temporal**, not just a current-state label.

Part of the **"work" half** of the site (see [two-halves.md](../two-halves.md)).

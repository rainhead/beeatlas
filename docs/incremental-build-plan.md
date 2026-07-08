# Incrementalizing the build — notes live in seconds

**Status:** proposal (not yet an ADR). **Scope confirmed with owner 2026-07-06:**
the contribution that must go live in seconds is **notes** — fully: correct
bylines and the no‑JS/first‑paint case, visible to *everyone*, not just the
author who wrote it. Mechanism is open; litestream was floated.

---

## 1. The problem, precisely

A note reaches other viewers only through the two heaviest pipelines we own.

- `notes.json` is a **build‑time** artifact. `_data/notes.js` reads it during the
  Eleventy build and bakes the `#notes` section into every species page
  (`_pages/species-detail.njk`). It is **never fetched at runtime.**
- The `bee-notes` island renders **nothing for guests/non‑authors**
  (`bee-notes.ts:403`). They see only the baked section. Authors see the baked
  notes and call the live `/api/notes` endpoint **only after their own write**
  (`_refetch`, `bee-notes.ts:119`).

So the freshness reality:

| Viewer | Sees a new note after… |
|---|---|
| The author who wrote it | instantly (own re‑fetch) |
| Any other author / any guest (JS) | next nightly `run.py` → `notes-harvest` → S3 → `repository_dispatch` → **full site rebuild** → `/*` CloudFront invalidation |
| Any no‑JS viewer | same full rebuild (there is no other path — no JS to fetch) |

The worst case is ~24 h + a whole‑site build. `notes-harvest` is step 30 of 30
in `run.py`, gated behind the ecdysis auth gate, iNat harvest, and the dbt build
— none of which a note depends on.

**Two orthogonal bottlenecks:**

1. **Read model.** Non‑authors never hit the live API, so they can't see live
   notes at all. (Frontend problem.)
2. **The baked artifact is welded to the monolith.** `notes.json` regenerates
   only inside the full nightly `run.py`, and the baked HTML updates only via a
   full site rebuild + `/*` invalidation. (Build problem.)

Litestream addresses *neither* directly — see §4.

---

## 2. Litestream — honest verdict: not for notes

Litestream continuously replicates a SQLite WAL to object storage (~1 s sync).
It is excellent for durability/replication. But:

- Its S3 artifacts are **WAL segments + snapshots for `litestream restore`**, not
  a random‑access queryable `.db`. **A browser cannot query the replica.**
  Getting a browser‑queryable live SQLite needs LiteFS or an HTTP‑range‑served
  `.db` (phiresky `sql.js-httpvfs`) plus a freshness mechanism — more infra than
  notes warrant.
- The notes store is **normalized and private** (`notes`, `note_revisions`,
  `users` with iNat numeric ids). Serving it to the browser means reimplementing
  the join + `status='approved'` filter + byline resolution in client SQL **and**
  exposing the `users` table. The API already does this correctly server‑side.

Where litestream *is* compelling is the **future occurrence read path** (§7): a
large, *derived* dataset the browser already queries in wa‑sqlite. That's the
"it will take a lot" investment — deliberately deferred, and not on the notes
critical path.

**Recommendation: solve notes without litestream.** Design the notes solution as
the first node of a general *event‑driven incremental publish* spine that the
later litestream work plugs into.

---

## 3. Target architecture for notes

Three layers, cheapest and highest‑impact first. Layers 0–1 deliver "live in
seconds for every JS viewer, correct bylines." Layer 2 covers no‑JS/first‑paint.

### Layer 0 — Live‑on‑load read for everyone (frontend)  ·  small

Make notes visible to all JS viewers in seconds without touching the build.

- `bee-notes` (or a lighter read‑only sibling that renders for guests too)
  fetches `/api/notes?species=` in `connectedCallback` for **all** viewers, not
  just after an author's own write. Keep the baked section as instant first
  paint; reconcile to live data when the fetch resolves.
- **Fix the byline on the live path.** `/api/notes` currently returns
  `display_name: null` → the island shows `@login` (`main.py:600` docstring
  admits this). Resolve `display_name`/`collector_url` from a small,
  always‑fresh `login → display_name` lookup the API can read. Reuse the
  existing `collectors.json` resolution — **not a second name system**
  (`feedback_reuse_display_name_resolution`); expose it as a compact map the API
  loads, refreshed by the same publish job as Layer 1.
- **Trade‑off:** every species‑page load now hits maderas for notes. Mitigate
  with a short‑TTL cache in front of the read endpoint (it's public, approved‑
  only, and cheap), or front it with CloudFront. The baked section means the
  page is never *blank* if the API is briefly down.

### Layer 1 — Event‑driven incremental publish of `notes.json`  ·  core

This is the literal "incrementalize the build" move: `notes.json` stops being
step‑30 of the nightly monolith and becomes a standalone job triggered by writes.

- On every note write/edit/delete/takedown/restore, the API enqueues a debounced
  **publish‑notes** job that: regenerates `notes.json` (it's tiny — the whole
  file, or just the touched species), content‑hashes it, PUTs to S3, and updates
  `manifest.json`. Reuse `data/notes_harvest.py` verbatim as the job body — it
  already reads the store read‑only (WAL) and resolves bylines from
  `collectors.json`.
- Remove `notes-harvest` from `run.py`'s critical path (keep a nightly
  full‑rebuild as a backstop/repair, but the live path no longer waits for it).
- **Caching tension to resolve:** `notes.json` is content‑hashed and the SW's
  `data-manifest` route is NetworkFirst. An event‑driven publish must update
  `manifest.json` atomically and let the SW pick it up. The live API path
  (Layer 0) sidesteps hashing entirely, so it's the primary freshness channel;
  the baked artifact is the durable/no‑JS channel.

### Layer 2 — no‑JS / first‑paint freshness  ·  hard, optional

The baked `#notes` HTML only changes on a site rebuild. No‑JS viewers can't run
a fetch, so their only path to freshness is re‑baking HTML.

- **Targeted single‑page rebake:** on a note write, render *only* the affected
  species page(s) and PUT to S3 with a scoped `/species/<slug>/` invalidation —
  not a full `npm run build` + `/*` invalidation. Achievable in seconds‑to‑a‑
  minute (CloudFront invalidation is usually <30 s).
- **Honest fallback if the cost isn't worth it:** no‑JS gets nightly freshness;
  JS gets seconds. Document this as an explicit PWA stance rather than pretending
  otherwise. Litestream does **not** help here (no JS to run a replica).

**Recommendation:** ship Layers 0 + 1 first (they deliver the headline result for
the ~100% of real users on JS). Treat Layer 2 as a follow‑up, defaulting to the
targeted‑rebake if we want true no‑JS parity.

---

## 4. What "seconds" actually costs, by layer

| Layer | New freshness | Effort | New runtime surface |
|---|---|---|---|
| 0 | JS viewers see any note in seconds | S | +load on `/api/notes` (mitigable) |
| 1 | Baked `notes.json` fresh within seconds of a write | M | a publish worker + S3/manifest write from maderas |
| 2 | No‑JS/first‑paint fresh in seconds | L | targeted Eleventy render + scoped invalidation on write |

---

## 5. Recommended sequencing

1. **Layer 0** — live‑on‑load fetch for all viewers + byline fix in the API.
   Biggest freshness win for the least code; no build changes.
2. **Layer 1** — event‑driven `notes.json` publish; pull `notes-harvest` off the
   nightly critical path. Establishes the incremental‑publish spine.
3. **Decision point** — measure whether no‑JS parity is worth Layer 2's targeted‑
   rebake. If yes, build it; if no, document the JS‑seconds / no‑JS‑nightly stance.
4. **Later / separate milestone** — the general incremental build graph (§6) and
   the litestream occurrence read path (§7). This is the "it will take a lot"
   part and is **not** required for the notes result.

---

## 6. The general shape (the "it will take a lot")

`run.py` is a linear `STEPS` list rebuilt wholesale nightly. The durable version
is a **dependency DAG keyed on input fingerprints**: each artifact rebuilds only
when its inputs change, driven by events rather than a single cron:

- notes store change → publish `notes.json` (+ optional page rebake)  ← Layer 1
- iNat WABA observation (webhook/poll) → incremental occurrence delta
- Ecdysis determination (poll) → incremental occurrence delta
- geography change (rare) → boundary artifacts

Notes are simply the first, cleanest node. Building it well (idempotent job,
content‑hash + manifest update, scoped invalidation) is the template every other
node reuses.

## 7. Litestream, placed correctly (future)

The occurrence dataset is the real litestream candidate: large, **derived**, and
already queried in‑browser via wa‑sqlite. The pattern would be — an incremental
transform maintains a compact occurrence replica DB; litestream/LiteFS ships it;
the browser applies deltas instead of re‑downloading the 31 MB `occurrences.db`.
That is the multi‑state‑scale investment (see `docs/concerns.md` scaling ceiling
and `project_multi_state_expansion`). It is deliberately **out of scope** for the
notes work and gated behind a real second use case per PRODUCT.md's
"speculative generality" exclusion.

---

## 8. Owner decisions (2026-07-07)

1. **No‑JS parity (Layer 2):** **build the targeted rebake.** No‑JS/first‑paint
   viewers get seconds‑level freshness via a single‑page Eleventy render + scoped
   `/species/<slug>/` invalidation on write — not a full build. So all three
   layers are in scope.
2. **Publish worker placement:** **a separate debounced worker** (systemd‑user
   unit on maderas), decoupled from the request path. The API records a change
   signal on write; the worker coalesces bursts and runs the publish + rebake.
   Write latency is never coupled to S3/CloudFront.
3. **Read‑endpoint caching:** **none for now.** `/api/notes` stays direct to
   maderas; the baked section is the resilience fallback. Revisit only if read
   load on maderas becomes a problem.

Direction recorded as **ADR 0013**.

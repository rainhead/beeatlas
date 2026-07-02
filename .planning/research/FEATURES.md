# Feature Research

**Domain:** Moderated expert-authored natural-history notes on species/taxon pages (first UGC feature on a static natural-history web map)
**Researched:** 2026-07-02
**Confidence:** HIGH (analogous-platform patterns well-established; MEDIUM on exact current iNat/BugGuide permission wording)

## Framing

v8.0's anchoring feature is a **deliberately thin vertical slice**: WA-specific, expert-authored prose on species pages. The milestone weight is meant to land on the *architecture* (first authoritative store, thin write layer, iNat OAuth, moderation loop, backup), not on feature surface. So this research is ruthlessly biased toward the **minimum credible note feature** and toward pushing everything else into anti-features / deferred.

The single most important design decision here is the **moderation model**, because it dictates whether v1 needs a moderation *queue + reviewer UI* (large) or just a *trusted-author gate + a delete button* (small). Recommendation below: **trusted-author (role-gated), post-moderation fallback.**

## How Analogous Platforms Handle Taxon-Level Community Text

| Platform | Who authors taxon text | Structure | Moderation model | Versioning | Pattern that transfers to a small WA atlas |
|----------|------------------------|-----------|------------------|------------|--------------------------------------------|
| **iNaturalist** | Taxon "About" description is **pulled from Wikipedia** (not authored in-app); **curators** (role-gated) manage taxonomy, links, names. Free-text community discussion lives on **observations, journal posts, and comments**, *not* on the taxon page. | Taxon page = curated facts + external text; discussion is elsewhere (per-observation). | Role-gated curation + flag/report on content; comments post-moderated. | Taxonomy changes have history; descriptions don't (they're Wikipedia's). | **Separate "authoritative curated text" from "discussion."** Don't put comment threads on the species page. Byline + role gate is the norm. |
| **BugGuide** | **~170 volunteer "contributing editors"** (role-gated) write/refine the species **Info** page; sources cited for peer review. Regular users cannot edit Info pages; they submit images + comments. | **Single canonical Info page per taxon**, editor-maintained; comments separate. | Trusted-editor model — editors are vetted; no per-edit queue. | Editor edits are effectively last-writer; light history. | **Closest analogue.** Single expert-authored prose block per taxon, role-gated authors, sources attributed. This is almost exactly the v8.0 target. |
| **Wikipedia / Wikispecies** | **Anyone** (open wiki). | Single article, sectioned, threaded talk page. | **Post-moderation** — publish immediately, revert/flag after; full revision control. | **Full version history** is core to the model. | Open-wiki + full history is *over-scoped* for v1. The revert-after model only works because MediaWiki has heavyweight history/patrol tooling. Do not emulate. |
| **eBird / Birds of the World (Macaulay)** | **Paid/invited experts** write species accounts (Birds of the World, paywalled). eBird itself has **no per-species community prose**; reviewers moderate *records*, not text. | Long-form authoritative species account, professionally edited. | Editorial (staff), not community. | Editorial versioning. | Confirms the high-credibility end: expert-authored, bylined, edited — but centralized. Validates "trusted author," not "open." |
| **GBIF** | **None** — aggregator. Species pages assemble text from source checklists / Catalogue of Life. | No native community text. | N/A | N/A | Reinforces: an atlas can be credible with *zero* community prose; notes are additive, so the empty state must be graceful. |

**Cross-platform takeaways for BeeAtlas:**
1. Credible taxon text is **almost always role-gated to trusted experts** (BugGuide editors, iNat curators, BotW authors). Fully-open authoring (Wikipedia) is the exception and requires heavyweight history/patrol tooling to stay credible.
2. **Community *discussion* is kept off the taxon page** and attached to observations/records. BeeAtlas should not put comment threads on species pages in v1.
3. A **single canonical prose block per taxon** (BugGuide) is the dominant shape, not threaded multi-author contributions.
4. **Attribution/byline is universal**; edit *history* is only core where authoring is open (Wikipedia).

## Feature Landscape

### Table Stakes (Users Expect These)

Features a credible expert-authored note feature cannot ship without.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Authenticated authoring via iNat OAuth** | Collectors already have iNat logins; identity must be real for attribution + trust | MEDIUM | Anchors the whole write layer. Login → app-side identity record keyed on iNat user id. |
| **Role gate for who can author** | A scientific atlas loses credibility if anyone can post prose on a species page; every analogue role-gates | LOW–MEDIUM | Simplest credible form: an **allowlist of trusted iNat logins** (curator-maintained seed), not a full RBAC system. Author-vs-reader is the only role split needed in v1. |
| **Create / edit a note on a species page** | Core value: expert writes WA-specific prose | MEDIUM | Depends on authoritative store + write layer. Author can edit **their own** note. |
| **Attribution / byline** | Readers must know who wrote it; provenance is a project value (mirrors per-trait `*_source`) | LOW | Display author display-name (+ link to iNat / collector page). Universal across analogues. |
| **Timestamps (created / updated)** | Freshness signal; "as of" is already a project idiom ("Data as of `<date>`") | LOW | Store + display "updated" date. |
| **Plain text or Markdown body** | Experts need paragraphs, maybe a link/italics for taxa; not a WYSIWYG | LOW | **Recommend Markdown, server-sanitized on render.** Avoid rich-text/HTML editors (XSS + complexity). Italics for scientific names is the one real need. |
| **Public read display on the species page** | The audience is all site visitors; notes are a learning surface | LOW | Build-time render is the *hard* part given static architecture — see Dependencies. Likely a JSON artifact merged like `species.json`, OR a runtime fetch. |
| **Graceful empty state** | Most of ~560 species will have no note; GBIF shows an atlas is fine with none | LOW | "No notes yet" (or simply render nothing). Must not look broken. |
| **Removal / takedown path** | Even trusted-author content occasionally needs pulling (error, dispute) | LOW | A curator "unpublish/delete" is the minimum moderation control. See moderation section. |

### Differentiators (Competitive Advantage)

Features that align with BeeAtlas's Core Value ("gathering place," "tighten learning cycles," provenance culture) and set it apart from just re-hosting iNat/GBIF text.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **WA-specific, locally-authored prose** | This *is* the differentiator — no upstream (iNat pulls Wikipedia, GBIF pulls CoL); regional expert knowledge exists nowhere else | (inherent) | The reason to build authoritative storage at all. |
| **Provenance-first presentation** | Byline + updated-date + "WA Bee Atlas note" framing sits naturally beside the existing per-trait `*_source` tooltips | LOW | Reuse the visual language of Traits provenance. Cheap credibility. |
| **Notes placed *with* the fact sheet, not in a silo** | Reader gets curated Traits + human context in one glance; tightens the learning cycle | LOW | Placement decision (see Display), not new tech. |
| **Multiple contributors per species (attributed list)** | Lets 2–3 experts each add a short note rather than fighting over one wiki block | MEDIUM | *Optional* v1. Simpler v1 = single note per species per author, rendered as a small stacked list. Avoids edit-conflict/merge entirely (each note is owned). **Recommended middle path.** |

### Anti-Features (Commonly Requested, Often Problematic)

Explicit "do NOT build in v1" list to protect the thin slice.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Pre-moderation queue + reviewer UI** | "Nothing goes public unreviewed" | Requires a whole reviewer workflow (queue, states, notify, approve/reject UI) — a second feature as big as the note itself; unjustified when authors are already trusted/vetted | **Trusted-author gate** (allowlist) + curator delete. Add a queue only if authorship opens up later. |
| **Open (anyone-can-author) authoring** | "Maximize contribution" | Instantly turns a scientific atlas into a spam/vandalism moderation problem; Wikipedia only survives it with heavyweight patrol tooling | Role-gate to vetted experts (matches BugGuide/iNat/BotW). |
| **Comment threads / discussion on species pages** | "Community engagement" | iNat deliberately keeps discussion on observations, not taxa; threads invite moderation load, notifications, spam, and dilute authoritative prose | Keep discussion on iNat observations. Species page carries only authoritative notes. |
| **Full wiki with revision history & diffs** | "Track every change / revert vandalism" | Each note is *owned* by its author (not a shared wiki block), so merge/revert isn't needed; version history is a large store + UI investment | Author-owned notes + "updated" timestamp. Revisit history only if shared-block editing is ever introduced. |
| **Real-time collaborative editing** | "Google-Docs feel" | Massive complexity (CRDTs/OT, presence, a live server) against a *static-hosting* baseline; zero demand for async expert prose | Simple save. One author edits their own note. |
| **Notifications / mentions / subscriptions** | "Tell me when a note changes" | Needs a notification subsystem, email/opt-out, delivery infra — a milestone of its own | None in v1. The nightly/build cadence already conveys freshness. |
| **Rich-text / WYSIWYG / image uploads in notes** | "Nicer formatting, add a photo" | HTML sanitization + image storage/licensing (CC concerns already live in `photos.json`) + editor bloat | Sanitized Markdown text only; link out for images. |
| **Reactions / upvotes / "helpful" scoring** | "Surface the best notes" | Engagement-metric machinery + gaming; irrelevant with a handful of trusted authors | Trust the byline; curator curates. |
| **Per-note public flagging by anonymous readers** | "Crowd-report bad content" | Flag queue + triage UI + abuse-of-flags handling; overkill at project scale where the curator knows the authors | A simple "email the curator" / contact path is enough at this scale; add in-app flagging only post-validation. |

## Moderation Models Compared

| Model | How it works | Cost | Right for a small volunteer-science project? |
|-------|--------------|------|-----------------------------------------------|
| **Pre-moderation (queue)** | Author submits → curator approves → publishes | HIGH — queue state machine, reviewer UI, notify loop | **No for v1.** Gold-plating. Justified only once authoring is opened beyond a trusted allowlist. |
| **Post-moderation (publish then flag/remove)** | Publishes immediately; flag/report + curator removes after | MEDIUM — needs flag capture + removal + audit | **Fallback layer.** The removal half is table stakes; the *flagging* half is deferrable (email the curator suffices at this scale). |
| **Trusted-author (role-gated, no queue)** | Only vetted experts (allowlist) can author; content is trusted at write time | LOW — an allowlist + author-vs-reader check | **Recommended primary model.** Matches BugGuide editors, iNat curators, BotW authors. Fits a project where the curator personally knows the ~dozen expert contributors. |

**Recommendation:** Ship **trusted-author (allowlist) as the primary gate**, with a **curator unpublish/delete** as the only always-on moderation control (the post-moderation safety valve). Do **not** build a pre-publish queue or in-app public flagging in v1. This collapses "moderation loop" from a subsystem into: (1) an allowlist seed, (2) an author-vs-reader check on write, (3) a curator delete/hide action. Roles needed: **reader (everyone), author (allowlisted), curator (can delete any note)** — three roles, and curator can be as simple as a second, shorter allowlist.

## Display Recommendations

- **Placement:** Directly on the species detail page, **adjacent to / just below the Traits fact sheet** and above or beside the occurrence maps — human context sits with curated facts to tighten the learning cycle. It is a *reference* surface, so it belongs in the retrospective/learning half of the page.
- **Multiple contributors:** Render as a **short stacked list of author-owned notes**, each with byline + updated-date, newest or curator-ordered. Avoids any merge/version machinery.
- **Provenance:** Reuse the existing Traits provenance visual language (source label / tooltip). Frame the block clearly as "Washington Bee Atlas notes" so readers don't mistake it for upstream data.
- **Empty state:** Render nothing, or a quiet "No notes yet" — most species will be empty and that must look intentional (GBIF-style: an atlas is credible with zero notes).
- **Edit affordance:** Only shown to authenticated allowlisted authors (their own note) and curators (any note). Readers see clean prose.

## Versioning / Edit History Verdict

**Deferrable — not table stakes for v1.** Edit history is core *only* where authoring is open/shared (Wikipedia). With **author-owned notes**, there is no merge, no revert, no vandalism-recovery need, so a `created` + `updated` timestamp is sufficient. NOTE: the authoritative store's own **forward-only migrations + backup** (already in the milestone) cover the *catastrophic* recovery case. Full per-note revision history is a v2 consideration, and only if shared-block editing is ever introduced.

## Feature Dependencies

```
iNat OAuth (identity)
    └──requires──> Thin managed write layer (accepts writes; bends "no server runtime")
                       └──requires──> Authoritative data store (non-reproducible, forward-only migrations)
                                          └──requires──> Build-seam refoundation (derived vs authoritative split)
                                          └──requires──> Safety-critical backup

Create/edit note ──requires──> iNat OAuth + write layer + authoritative store
Role gate (allowlist) ──requires──> iNat identity (to key the allowlist on)
Public note display ──requires──> a read path from authoritative store to the (static) species page
Curator delete (moderation) ──requires──> Role gate + write layer
Byline/timestamp ──enhances──> Public note display (provenance culture)

Comment threads ──conflicts──> "thin slice" intent (do not build)
Pre-moderation queue ──conflicts──> trusted-author model (redundant; do not build)
```

### Dependency Notes

- **Everything user-facing sits on the architecture stack.** The note CRUD is small; its dependencies (OAuth, write layer, authoritative store, backup, build-seam split) are the milestone. This is by design — the slice is thin so the architecture gets the attention.
- **Public display vs. static hosting is the load-bearing tension.** The site is static; data reaches pages via CloudFront-fetched artifacts (`species.json` pattern) or client-side fetch. Notes are *authoritative and low-volume*, so two viable read paths: (a) **bake into a JSON artifact** merged at build like `species.json` (freshness bounded by build cadence — acceptable for expert prose), or (b) **runtime fetch** of notes-by-taxon from a small endpoint/artifact (fresher, but a live read path). The write path already forces *some* runtime surface; the read path can still stay build-time. Requirements should pick one explicitly — it's the key architecture fork.
- **Role gate keys on iNat identity**, so OAuth must land before/with the allowlist.
- **Curator delete is the whole moderation loop in v1** — it depends only on the role gate + write layer, no new subsystem.

## MVP Definition

### Launch With (v1 — the thin slice)

- [ ] **iNat OAuth login** — real identity for attribution and the author gate.
- [ ] **Trusted-author allowlist** (author vs. reader; curator as a second short list) — credibility without a queue.
- [ ] **Create / edit own note** (sanitized Markdown, plain paragraphs + italics) — the core act.
- [ ] **Public display on species page** with byline + updated-date + "WA Bee Atlas note" framing — the value delivered.
- [ ] **Graceful empty state** — because most species have none.
- [ ] **Curator delete/unpublish** — the entire moderation loop for v1.
- [ ] **Authoritative store + forward-only migrations + backup** — the non-negotiable architecture (milestone core).

### Add After Validation (v1.x)

- [ ] **Multiple attributed notes per species** if single-author-per-species proves too limiting (trigger: an expert asks to add a second perspective).
- [ ] **In-app flag/report** if off-band "email the curator" moderation proves insufficient (trigger: content problems the curator isn't catching).
- [ ] **Runtime-fresh read path** if build-cadence staleness annoys authors (trigger: "I edited my note and it's not live for a day").

### Future Consideration (v2+)

- [ ] **Edit/version history + diffs** — only if authoring ever opens beyond the trusted allowlist or moves to a shared-block model.
- [ ] **Pre-moderation queue** — only if authorship broadens past personally-vetted experts.
- [ ] **Notes on higher taxa (genus/subgenus/tribe)** — natural extension once species notes are proven.
- [ ] **Notifications / subscriptions** — a subsystem of its own; defer until there's demand.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| iNat OAuth login | HIGH | MEDIUM | P1 |
| Trusted-author allowlist gate | HIGH (credibility) | LOW | P1 |
| Create/edit own note (Markdown) | HIGH | MEDIUM | P1 |
| Public species-page display + byline/timestamp | HIGH | MEDIUM (static read path) | P1 |
| Graceful empty state | MEDIUM | LOW | P1 |
| Curator delete (moderation) | MEDIUM | LOW | P1 |
| Authoritative store + migrations + backup | HIGH (architecture) | HIGH | P1 |
| Multiple attributed notes per species | MEDIUM | MEDIUM | P2 |
| In-app flag/report | LOW | MEDIUM | P2 |
| Runtime-fresh read path | MEDIUM | MEDIUM | P2 |
| Edit history / diffs | LOW | HIGH | P3 |
| Pre-moderation queue | LOW | HIGH | P3 |
| Comment threads | LOW (negative) | HIGH | Anti |
| Real-time collab / notifications / reactions | LOW | HIGH | Anti |

**Priority key:** P1 = launch · P2 = add after validation · P3 = defer · Anti = do not build.

## Competitor Feature Analysis

| Feature | iNaturalist | BugGuide | Wikipedia/Wikispecies | Our Approach (v1) |
|---------|-------------|----------|-----------------------|-------------------|
| Who authors taxon text | Curators (links/facts); About pulled from Wikipedia | ~170 vetted contributing editors | Anyone | **Trusted-author allowlist (vetted experts)** |
| Prose structure | Not on taxon page (discussion on observations) | Single canonical Info page | Single article + talk | **Author-owned note(s) per species** |
| Moderation | Role-gated curation + flag | Trusted-editor, no queue | Post-moderation + patrol | **Trusted-author + curator delete (no queue)** |
| Attribution | Curator/observer bylines | Editor + cited sources | Contributor history | **Byline + updated-date + WA framing** |
| Versioning | Taxonomy history only | Light | Full revision history | **Timestamps only (deferred history)** |
| Discussion | On observations, not taxa | Comments (separate) | Talk pages | **None on species page (stays on iNat)** |

## Sources

- iNaturalist Curator Guide — https://www.inaturalist.org/pages/curator+guide (role-gated taxon curation; About pulled from Wikipedia) — MEDIUM (exact non-curator edit rights not fully confirmed)
- iNaturalist Community Forum, taxonomy curation wiki — https://forum.inaturalist.org/t/improvements-to-taxonomic-curation-on-inat-wiki/5398 — MEDIUM
- BugGuide Help/Guide — https://bugguide.net/help/guide ; BugGuide — Wikipedia https://en.wikipedia.org/wiki/BugGuide (~170 volunteer contributing editors maintain Info pages, sources cited) — MEDIUM
- Wikipedia/Wikispecies open-wiki + revision-history model (post-moderation) — HIGH (well-established)
- eBird / Birds of the World editorial expert-authored species accounts — HIGH (well-established)
- GBIF species pages (aggregated, no native community text) — HIGH (well-established)
- BeeAtlas `.planning/PROJECT.md` v8.0 milestone framing (derived-vs-authoritative split, thin-slice intent, provenance culture) — HIGH

---
*Feature research for: moderated expert-authored species natural-history notes (BeeAtlas v8.0)*
*Researched: 2026-07-02*

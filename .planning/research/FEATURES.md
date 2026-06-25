# Feature Research: v6.0 My Work — Progress & Provenance

**Domain:** Per-collector "work" surface — personal event stream + accomplishments for volunteer bee collectors
**Researched:** 2026-06-24
**Confidence:** HIGH (iNat/eBird behavior from official docs + help centers; citizen-science motivation
research from peer-reviewed literature; gamification design from multiple sources; data dependencies
derived from current codebase knowledge)

---

## Scope Boundary

This research covers the NEW features in v6.0: a per-collector page (bookmarkable, no auth,
public data) surfacing a collection→ID event stream and accomplishment/coverage view. Pre-built
features (Mapbox map, filter system, taxon/place static pages, occurrence detail cards, offline
PWA) are treated as givens. The "work" surface is the first personal page type — it follows the
existing per-taxon/per-place static-page pattern.

**Explicitly deferred and out of scope:**
- Community/shared liveness feed ("someone near you found a Bombus") → `collection-event-coordination.md` seed
- Role badges ("instructor", "trainer") — need a roster/identity source absent from the pipeline
- "Where to go next" planning surface (gaps × access × bloom) → `where-to-go-next.md` seed

---

## Ecosystem Patterns: What Comparable Platforms Do

**iNaturalist user profile:**
Counts (total observations, species, identifications), activity graphs, badges by volume tiers
(10/50/500 observations), account-age badges, longest streak. Weak point: the personal stats are
buried, the community has repeatedly asked for a better achievements page, and there is no
lifecycle view ("did my observation get IDed?") — you have to hunt through your observation list
manually. The "Needs ID" vs "Research Grade" status is visible per-observation but not surfaced
as a personal event feed.

**eBird My eBird:**
The gold standard for personal birding dashboards. Per-year/month/day totals; life list, year
list, county list, yard/patch lists automatically maintained with every checklist submission;
profile map coloring regions by activity; recent checklists surfaced prominently; bar charts
comparing current year to prior years; species/checklists/media toggles. Genuinely useful because
the data (checklists submitted) arrives in near-real-time and the lists are derivative — zero
extra user work. Notable: no cheap badge soup. The satisfaction comes from the lists and the map
filling in, not from earning arbitrary points.

**Zooniverse:**
Contribution counts and volunteer hours, but no per-record feedback. Volunteers never find out if
their classification was correct or contributed to a scientific result. This is a well-documented
retention problem in citizen science literature — rapid feedback on submitted records is the most
cited factor for volunteer retention.

**Bumble Bee Watch:**
Photo submissions enter a manual expert-verification queue. The user can see their submission but
has no feedback on its verification status unless they proactively check. The gap between
submission and expert ID is measured in weeks or months. Exactly the gap WABA should close.

**Research consensus on citizen science motivation:**
"Communication and feedback were rated the most important organisational offers by citizen science
participants" (Tandfonline, 2020). "Rapid feedback on submitted records has the potential to
strengthen engagement." Volunteers want to feel their time is well spent. The Zooniverse model
(batch work, no individual feedback) works for click-through tasks; it fails for skilled
specimen-based science where the individual record matters.

**Gamification design research:**
Well-designed gamification uses milestones that are intrinsically meaningful (a new county record
IS a real scientific finding) rather than arbitrary point thresholds. Duolingo's weakness is that
streaks become an obligation divorced from actual learning; when the streak breaks, there's
nothing left. The eBird model works because the list is the activity, not a reward layered on
top. The iNat badge-soup approach (brown/beige/green tiers for observation counts) is mildly
engaging but hollow. For WABA the right model is eBird's: surface the data itself as the
accomplishment, not a points layer.

---

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Data Dependencies |
|---------|--------------|------------|-------------------|
| **Per-collector page** (bookmarkable URL, e.g. `/collectors/janedoe`) | Follows the established per-taxon/per-place static page pattern already in the site; a collector should be able to share their page | LOW | Collector attribution field already in `occurrences.parquet` (`recordedBy`); page generation follows Eleventy pattern |
| **Total count stats** (specimens, samples, species, years active) | iNat/eBird both surface summary counts; absence feels like an oversight | LOW | Derivable from existing occurrence columns; no new pipeline fields needed |
| **Current status breakdown** ("N awaiting ID, N identified, N provisional") | Volunteers' core question is "where do my bees stand?" without having to count manually across iNat/Ecdysis | LOW–MEDIUM | Requires `is_provisional` column (already in occurrences) + an `id_status` derived field; relies on the source→facets rebuild |
| **County coverage map** | eBird's profile map is the single most cited "satisfying" feature; for a state atlas, seeing your counties fill in is the natural equivalent | MEDIUM | County field already in occurrences (`county`); need per-collector aggregation by county; reuse SVG map pattern from taxon pages |
| **Taxon breadth list** ("species you've contributed to") | Answers "what have I personally contributed to the scientific record?" — the core reward | LOW | Derivable via GROUP BY collector + taxon_id on occurrences; taxa already keyed on taxon_id |
| **Static page, no auth required** | WABA collectors are not going to make accounts; public data means no login gate; the existing per-taxon/per-place pattern sets this expectation | LOW | Self-identification via URL (e.g., visiting `/collectors/janedoe`) — no session state |

### Differentiators (Competitive Advantage for WABA)

| Feature | Value Proposition | Complexity | Data Dependencies |
|---------|-------------------|------------|-------------------|
| **Personal event stream** (collection→ID lifecycle feed) | No other tool in the WABA ecosystem (Canvas, iNat, Ecdysis, Facebook) closes this loop. "Your sample from June 5 was identified as *Agapostemon virescens*" is information a volunteer currently has no reliable way to receive | HIGH | Requires temporal lifecycle data — either pipeline-side `first_appeared_at` / `id_status_changed_at` timestamps, or client-side diff against a locally stored watermark. This is the open fork. The pipeline currently emits a snapshot. **This is the hardest dependency.** |
| **"New county record!" milestone marker** | A first occurrence in a county is a genuine scientific contribution — surfacing it as a named event makes the significance legible without hype | MEDIUM | Requires a per-collector, per-species, per-county query to identify which of a collector's records were the first for that combination. Derivable at build time from existing data. |
| **Pending vs identified visual split** | A two-section layout — "still waiting for ID" above, "returned IDed" below — converts status anxiety into actionable visibility | LOW–MEDIUM | Depends on reliable `id_status` derivation; the source→facets rebuild must expose this cleanly |
| **"Years active" derivable badge** | Earnable from occurrence dates alone, no roster needed; reflects genuine longitudinal commitment; renders as "Active since 2022 (3 seasons)" not a cheap point total | LOW | `MIN(date)` GROUP BY collector; already in data |
| **Recency signal on the map** | Showing where a collector has collected (dot map, colored by year) gives a spatial autobiography that's intrinsically interesting | LOW | All occurrence points have collector attribution + coordinates; reuse Mapbox point rendering |
| **Link to the filtered main map** | "See your occurrences on the map" deep-links to the main map pre-filtered to the collector — pays off the existing filter/URL system | LOW | Existing `?collector=` filter (to be built in source→facets rebuild) + URL state system |
| **Ecoregion breadth** | For collectors who range across different habitat types, ecoregion coverage is meaningful — "collected in 4 of 7 WA ecoregions" conveys dedication | LOW | `ecoregion_l3` already in occurrences; same derivation as county |

### Anti-Features (Explicitly NOT Build)

| Anti-Feature | Why It's Requested | Why to Avoid | What to Do Instead |
|--------------|-------------------|--------------|-------------------|
| **Leaderboards / rankings** | "Who's contributed the most?" feels like useful motivation | Demotivates the vast majority (bottom 90%) who are not at the top; research shows leaderboards benefit the top tier and harm retention for everyone else; turns collaboration into competition | Surface personal progress vs the collector's own prior years (eBird model: "your best June ever") not vs other collectors |
| **Generic point totals** | Satisfying to watch a number grow | Disconnected from scientific meaning; motivates gaming (many low-quality observations) over quality; eBird deliberately does not show a "total score" | Show counts that ARE the data: specimens, species, counties — things that mean something independently of the platform |
| **Streak tracking** (consecutive days active) | Duolingo-brained users may want this | Collecting bees has seasons; a winter break is not failure; streaks create anxiety and obligation around a volunteer hobby; breaks the Duolingo model entirely for a seasonal activity | Show "years active" and "active seasons" instead — celebrates commitment over duration without punishing seasonal gaps |
| **Push notifications / email alerts for ID events** | "Notify me when my bee gets IDed" is the intuitive request | No server infrastructure (static hosting only constraint); requires opt-in auth flow; push subscriptions require a service worker + push server; out of scope | The event stream on the collector page IS the notification surface — the collector checks it like a feed when they want to; periodic link-sharing fills the pull role |
| **Private / authenticated collector page** | "I don't want everyone to see my stats" | All occurrence data is already public; no PII beyond iNat handles is involved; adding auth to a static site requires a significant infrastructure change | Page is public but hard to discover (no site-wide index of collectors initially); the handle-in-URL pattern is opt-in (you share your URL) |
| **Self-submitted records (new observations entered here)** | "I want to log my collection directly on BeeAtlas" | WABA already uses iNat + Ecdysis as canonical record systems; duplicating them builds a competing data entry system and diverges from the pipeline data; scope is enormous | Deepen the read/display of existing records instead; the value add is the synthesis view, not the entry point |
| **Community feed on the collector page** | "See what other collectors near you found" | Deferred deliberately to `collection-event-coordination.md` seed; premature before semi-regular site users exist; cold-start problem — sparse feed worse than no feed | Build personal-only stream first; validate engagement before adding community layer |
| **Role badges** ("Master Collector", "Instructor") | Recognition of community contribution | Need a roster/identity data source that does not exist in the occurrence pipeline; cannot be derived from observation data alone | Derivable badges (years active, counties, species count) first; role badges when a roster exists |

---

## Feature Dependencies

```
[Source → Facets Rebuild]
    └──required by──> [Personal Event Stream] (needs collector-attributed occurrence–sample pairs)
    └──required by──> [Pending vs Identified Split] (needs clean id_status derivation)
    └──required by──> [Filter-to-collector map link] (needs collector= URL param)

[Temporal ID-Status Lifecycle]  ← design fork (pipeline timestamps vs client watermark)
    └──required by──> [Personal Event Stream] (needs "what changed" not just "current state")
    └──enhances──> [Pending vs Identified Split] (makes "when it changed" visible)

[Per-Collector Page (static, Eleventy)]
    └──required by──> [County Coverage Map on collector page]
    └──required by──> [Taxon Breadth List on collector page]
    └──required by──> [Years Active Badge]
    └──required by──> [Ecoregion Breadth]
    └──required by──> [Collector dot map]

[County Coverage Map]
    └──requires existing──> [county field in occurrences]
    └──requires existing──> [SVG map generation pattern from taxon pages]

[New County Record Milestone]
    └──requires──> [Per-Collector Page]
    └──requires──> [county field in occurrences]
    └──requires build-time query──> [first collector × species × county occurrence]
```

### Dependency Notes

- **Source→facets rebuild is the prerequisite:** the event stream cannot be meaningful without
  collector-attributed occurrence–sample pairs where `id_status` is derived cleanly. This is the
  v6.0 foundational phase and must land before the personal page features.

- **Temporal fork is the hardest dependency:** the event stream requires knowing *what changed*
  since the user last visited, not just the current state. Two options: (a) pipeline adds
  `first_appeared_at` / `id_status_changed_at` columns — permanent nightly snapshot enrichment,
  HIGH confidence in the feed; (b) client stores a "last visited" watermark in localStorage and
  diffs the current snapshot against it — no pipeline change, but ephemeral (clears on device
  switch). This fork must be resolved at discuss/plan time. Recommendation: option (a) for
  accuracy; option (b) is a viable faster fallback.

- **Per-collector page follows the Eleventy pattern:** the existing per-taxon/per-place page
  generation logic is the template. The main difference is that "collector" is a person identity,
  not a scientific category, so the index is keyed by `recordedBy` handle normalization.

- **New County Record is a build-time query:** "which of this collector's occurrences were the
  first in their county for that species?" is a pure SQL question answerable at Eleventy build
  time. It does not require any new pipeline infrastructure. It does require that `county`,
  `taxon_id`, `recordedBy`, and `date` are all populated — which they are for Ecdysis and iNat
  records (checklist records have lower spatial precision and should be excluded from county-record
  claims).

---

## MVP Definition

### v6.0 Launch With (the "Status THEN Accomplishment" arc)

The sequence matters. Status (event stream) is the hook — it answers the question volunteers
actually have right now. Accomplishment is the reward they discover after. Build in this order.

**Phase A — Foundation (source→facets rebuild + collector page skeleton):**
- [ ] Source→facets rebuild — orthogonal collector/provenance/id-status facets replacing `source`
- [ ] Per-collector page at `/collectors/{handle}` (Eleventy static, no auth)
- [ ] Total count stats (specimens, samples, species, years active)
- [ ] Current status breakdown (awaiting ID, identified, provisional)
- [ ] Collector index page or discoverable via URL convention

**Phase B — Status surface (event stream):**
- [ ] Temporal id-status lifecycle decision resolved and implemented (pipeline timestamps recommended)
- [ ] Personal event stream: collection→ID lifecycle, ordered reverse-chronologically
- [ ] "New county record!" milestone events in the stream
- [ ] Pending vs identified visual split on the page

**Phase C — Accomplishment surface (coverage + breadth):**
- [ ] County coverage map (SVG, matches taxon-page pattern)
- [ ] Taxon breadth list (species contributed to, with taxon links)
- [ ] Ecoregion breadth
- [ ] "Active since YYYY (N seasons)" badge
- [ ] Link to filtered main map (`?collector=handle`)

### v6.1 Add After Validation

- [ ] Collector dot map (occurrence points, color by year) — adds spatial autobiography
- [ ] Year-over-year comparison chart (eBird-style bar) — "your best collection year"
- [ ] Highlight "first for WA" occurrences if any exist

### v2+ Future Consideration

- [ ] Community feed on collector page — deferred to `collection-event-coordination.md`
- [ ] Role badges — requires roster data source
- [ ] "Where to go next" suggestions — separate seed; requires gap × access × bloom data

---

## Feature Prioritization Matrix

| Feature | Volunteer Value | Build Cost | Priority |
|---------|----------------|------------|----------|
| Source→facets rebuild | HIGH (substrate for everything) | HIGH | P1 |
| Per-collector page skeleton + stats | HIGH (table stakes) | LOW | P1 |
| Status breakdown (awaiting/ID'd/provisional) | HIGH (answers #1 question) | LOW–MEDIUM | P1 |
| Temporal lifecycle + event stream | HIGH (core differentiator) | HIGH | P1 |
| "New county record!" milestone | HIGH (intrinsically meaningful) | MEDIUM | P1 |
| County coverage map | HIGH (eBird model — satisfying) | MEDIUM | P1 |
| Taxon breadth list | MEDIUM | LOW | P1 |
| Years active / seasons badge | MEDIUM | LOW | P1 |
| Ecoregion breadth | MEDIUM | LOW | P2 |
| Link to filtered main map | MEDIUM | LOW | P2 |
| Collector dot map | LOW–MEDIUM | LOW | P2 |
| Year-over-year comparison | LOW | MEDIUM | P3 |
| Community feed | HIGH (long-term) | HIGH | DEFERRED |

---

## Competitor Feature Analysis

| Feature | iNaturalist | eBird | WABA v6.0 Approach |
|---------|-------------|-------|-------------------|
| Personal stats page | Basic counts; buried achievements; badge-soup | Excellent: lists auto-maintained, profile map, yearly comparison | Follow eBird structure; omit the badge soup |
| ID lifecycle visibility | Per-observation status visible; no feed; user must hunt | N/A (IDs are instant via community voting) | Build the feed iNat lacks — this is the gap |
| County coverage map | Not provided | Profile map coloring regions | Replicate eBird's most-loved feature for WA counties |
| New-record milestones | No | No | Build as in-stream events — intrinsically meaningful, not gamified |
| Streak/points | Streak counter; observation count badges | No streaks; lists are the metric | No streaks (seasonal activity); no points; counts only |
| Community on personal page | Followers/following; comment threads | Friends see your checklists | Deferred — build after personal surface validates |
| Auth required | Yes (to submit) | Yes (to submit) | No — display only, public data |

---

## Sources

- [My eBird Help Center](https://support.ebird.org/en/support/solutions/articles/48000794682-my-ebird) — dashboard features, list types, profile map
- [New ways to explore your activity on My eBird](https://ebird.org/news/updated-my-ebird) — design philosophy, recent-activity emphasis, yearly totals
- [eBird: The Gamification of Birding?](https://becausebirds.com/ebird-gamification-birding/) — life list as intrinsic motivator, comparison to Pokédex mechanic
- [iNaturalist Badges announcement](https://www.inaturalist.org/posts/26934-introducing-badges) — badge tier structure
- [iNaturalist community: better stats/achievements page request](https://forum.inaturalist.org/t/a-more-easily-accessible-and-fun-user-stats-achievements-page-section/9325) — evidence for iNat stats gap
- [Meeting volunteer expectations — retention review (Tandfonline 2020)](https://www.tandfonline.com/doi/full/10.1080/09640568.2020.1853507) — feedback as top retention factor
- [Community science participants gain awareness but improvements needed (PeerJ 2020 — Bumble Bee Watch)](https://peerj.com/articles/9141/) — gaps in expert-verification feedback loop
- [Bumble Bee Watch program analysis (PMC 2024)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11111064/) — community science program structure
- [Why Duolingo's gamification works (and when it doesn't) (dev.to)](https://dev.to/pocket_linguist/why-duolingos-gamification-works-and-when-it-doesnt-1d4) — streak anti-pattern for seasonal activities
- [Gamifying citizen science: study of two user groups (ResearchGate)](https://www.researchgate.net/publication/262291073_Gamifying_citizen_science_A_study_of_two_user_groups) — badges vs intrinsic motivation
- [iNaturalist observation lifecycle](https://www.inaturalist.org/posts/62770-what-is-a-verifiable-observation-and-how-does-it-reach-research-grade) — Casual → Needs ID → Research Grade status model
- Project context: `.planning/notes/work-vs-learning-two-halves.md`, `.planning/seeds/me-and-my-progress.md`, `.planning/research/questions.md`

---

*Feature research for: v6.0 My Work — Progress & Provenance (Washington Bee Atlas)*
*Researched: 2026-06-24*

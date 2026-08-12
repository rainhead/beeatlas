# 0033 — Determination trust: trust an expert, unless an expert disagrees

Date: 2026-08-11
Status: Accepted
Issues: beeatlas-59d (this record), beeatlas-r2u (interim photo-pipeline gate),
beeatlas-16m/fc4/9sy/xs1/nyr/amp/vsrh/kmxs (implementation track),
beeatlas-0o1 (closed; the provenance evidence below)

## Context

iNat's `quality_grade=research` was our proxy for "this determination is
trustworthy." It measures the wrong thing, in both directions:

- Research grade requires **species-level** community agreement. For the taxa
  where genus or subgenus is the *terminal* determination (Neolarra, Dialictus,
  Melanosmia, …), the promotion mechanism exists — a vote that the ID cannot be
  improved — but goes unused, because casting it requires asserting something
  nobody can honestly assert. `needs_id` there means *nobody is willing to claim
  this is as far as it goes*: an honest epistemic state that will not resolve
  itself. Both Neolarra worked examples (observations 287199989, 284980903)
  are `needs_id` despite five agreeing genus-rank identifications including
  johnascher. Research grade excludes this material forever.
- Conversely, research grade is a procedural step, not a trust measure: two
  drive-by agreements clear it.

Meanwhile the `inat_expert` arm's roster is an `ident_user_id` export filter,
which only guarantees an expert *looked* at the observation — not that they
agreed with the community taxon we ingest (the caveat recorded in
`data/raw/inat_expert_obs.sh` and [domain-model.md](../domain-model.md)
Category 4). And `pull-candidates.mjs` carried a comment justifying its lack of
any quality filter as "these are OUR determinations" — true for the specimen
arms, wrong for arm 4.

An intermediate design (≥N independent identifications agreeing at the query
rank) was worked out on the beeatlas-3ed/r2u threads and superseded during
design by the rule below; see Rejected Alternatives.

**Provenance evidence** (beeatlas-0o1, verified 2026-08-11): every current
Ecdysis identification bearing a real taxon name is attributed — 28,920 to one
of ~35 named people (WSDA/WSU-centered: Lankford 16k, Wright 9k, Salp 2k, …),
17 to the process actor "Nomenclatural Adjustment", exactly 1 anonymous (and it
carries no taxon). The occurrence side corroborates: all 29,474 determined
occurrence rows carry a named `identified_by`. Ecdysis holds **exactly one
current identification per specimen** (a supersession chain, not a vote
record), so corroboration can only ever come from linked iNat observations.

## Decision

**Trust an expert's identification, provided no other expert disagrees. Trust
an Ecdysis determination as expert-made or expert-reviewed at ingestion —
by provenance, evidenced above — under the same veto.**

This is provenance-based trust plus a veto, replacing vote counting. It is how
determination trust works in collections practice: trust the *determinavit*,
annotate disagreement.

Supporting definitions, all binding:

1. **An Identification is a cross-source domain concept**: a person asserting
   a taxon for an occurrence record. The same person identifying a bee on iNat
   and determining its Ecdysis specimen has made ONE identification, recorded
   twice. Sources join via `specimen_observation_id`. Consensus is therefore a
   BeeAtlas computation, never a purely-iNat one.
2. **Compatibility, synonyms first.** Apply occurrence synonymy before
   comparing (an ID of *Bombus californicus* against *B. fervidus* is
   agreement). Then: an identification agrees with taxon T when its taxon is
   T or a descendant; a finer-rank ID within T is agreement-plus-refinement,
   never conflict. Incompatible = neither taxon is an ancestor of the other
   after synonym resolution. Ancestry comes from local lineage plus ingested
   per-identification `ancestor_ids` — never per-ID bridge lookups (ADR 0030).
3. **Rank-scoped veto.** The **trusted taxon** of a record is the deepest
   assertion compatible with *every* current expert assertion. Expert A
   "*Bombus fervidus*" vs expert B "*B. flavifrons*" blocks trust at species,
   leaves trust at *Bombus* intact, and surfaces as an anomaly. A record
   qualifies for query taxon T iff T is ancestor-or-self of its trusted taxon
   — one derived value answers photo gating, display claims, and any future
   arm derivation.
4. **Only expert disagreement vetoes.** A non-expert disagreeing with an
   expert (or with an Ecdysis determination) never suppresses trust; it lands
   in the curation anomalies report. Otherwise any drive-by ID could suppress
   an expert determination.
5. **Expert status lives in the identifier register** (curated seed,
   beeatlas-16m), seeded from the roster in `data/raw/inat_expert_obs.sh`; the
   register is the single authority. The Ecdysis side deliberately needs **no
   per-determiner expert classification** — determinations there are trusted by
   ingestion provenance, so the flag governs only whose *iNat* identifications
   assert or veto. The register extends the existing
   `inat_login ↔ recordedBy` person resolution; never a second name system.
6. **Current assertions only.** Superseded/withdrawn identifications
   (`identification_is_current` on Ecdysis, `current` on iNat) never count for
   or against anyone. An expert whose *current* assertions are incompatible
   across systems is not trusted on that record, and the case is an anomaly.
7. **The Ecdysis occurrence record is the determination of record**, not the
   identifications table: 532 specimens publish with names that exist only on
   the occurrence record (zero current identification rows), and 6+6 rows
   disagree between the two tables (all reconciliation artifacts — one person
   vs himself, including a cross-family Sphecodes/Triepeolus). Models read the
   determination from `occurrences`, treat the identifications table as
   attribution and supersession history, and route the 544 discrepancy rows to
   the anomalies report.
8. **Sentinels.** 'undetermined' placeholder rows and "Nomenclatural
   Adjustment" are excluded in the identifications-arm intermediate
   (`int_ecdysis_identifications`), not at staging —
   `stg_ecdysis__identifications` stays unfiltered because `int_id_modified`
   aggregates MAX(modified) over ALL rows including sentinels (beeatlas-fc4).
   There are no anonymous determinations to weigh (evidence above).
9. **Qualifier semantics — the hedge-target rule** (decided 2026-08-12,
   beeatlas-xs1; supersedes the genus default this record originally proposed
   under Open). The qualifier census shows determiners already put their
   *confident* rank in the name — hedged epithets ride the qualifier next to
   a genus-only name (`Lasioglossum` + `cf. pacatum`). So the epithet always
   points at a species: the **hedge target**. A hedged assertion asserts the
   target's **anchor** — its deepest ancestor above species rank: species
   complex if available, else subgenus, else genus (Peter: "why not demote to
   complex or subgenus when available?"). One rule covers both directions:
   - binomial + bare hedge (`?`, `nr.`) — target is the named species; the
     assertion *demotes* to its anchor (*Heriades occidentalis* `?` →
     subgenus *Neotrypetes*).
   - genus name + epithet hedge (`cf. X`, `aff./af. X`, `n. sp. aff X`,
     `X group`) — target is genus+epithet; the assertion *refines* the bare
     genus to the target's anchor (*Lasioglossum* `cf. pacatum` → the
     *L. viridatum* species complex, via subgenus *Dialictus*).
   - slash alternation (`a/b`) — the assertion is the LCA of the two targets
     (*Coelioxys* `novomexicanus/octodentatus` → subgenus *Boreocoelioxys*).
   - refinements never demote: `subsp. X` asserts the named species;
     `subg. (X)` asserts that subgenus. `sp.` is a no-op.
   - unresolvable hedge target → the FACE name's anchor, so the hedge still
     demotes (*Perdita nevadensis* `aff. molina` with no local *P. molina* →
     *Pygoperdita*, never species-level *nevadensis*); other unresolvable
     steps → the post-synonym name at face value.
   Synonyms apply before target resolution; resolution uses local lineage
   (`taxa.csv.gz` ancestry) only — never per-ID lookups (ADR 0030).

### Boundaries

- **Not a universe filter.** ADR 0032 admits expert-identified observations to
  the species universe without this gate; that stands. Trust gates *selection
  and claims* (photos, display), not existence.
- **Non-expert-only material is never trusted**, however many community IDs
  agree. Immaterial today (the vetted arms are expert-touched by
  construction), but a real semantic for any future wider pull — intended.
- The independent-identifier **count survives as display color** ("…and 4
  others agree"), no longer as a gate.

## Consequences

- The Neolarra-class material (19 subgenera of photo-hard groups carrying 78%
  of the scored no-page candidate photos) becomes reachable: one compatible
  expert ID with no expert veto qualifies it at the rank it was determined to.
- The arm-4 overstatement is repaired at the point of use: trust requires the
  expert's *actual asserted taxon* (hence the identifications ingestion,
  beeatlas-9sy — no local identification data exists today), not roster
  membership.
- The photo pipeline gains its missing quality rule for arm-4 candidates on
  species pages too, not just the higher-rank unlock (beeatlas-r2u, interim
  iNat-domain implementation; superseded by the dbt artifact when
  beeatlas-nyr publishes).
- Two questions from the ≥N design dissolve: the N threshold and whether the
  observer's own ID counts (an observer who is an expert asserts like any
  expert; one who isn't, doesn't gate).

## Rejected Alternatives

- **`quality_grade=research`** — measures a procedural step; structurally
  unattainable exactly where terminal determinations are coarse (context
  above). Remains only in the dormant seeder tiers 2–4 with a pointer here.
- **≥N independent identifications agreeing at the query rank** (the
  intermediate design, N=2 calibrated to research grade's agreement core).
  Superseded before implementation: it counts heads where the domain trusts
  *provenance*, would let N non-expert agreements outvote silence, and needed
  an N nobody could principle. Its lasting contributions — rank-uniform
  page-independent framing, cross-source person dedup, compatibility
  semantics, current-only — are all retained above.
- **Per-determiner expert classification on the Ecdysis side** — unnecessary;
  ingestion provenance covers it, and classifying ~35 people individually
  invites disputes the rule avoids.

## Open

- ~~Qualifier semantics (`cf.`/`aff.`/`?`, 345 rows). Default: a qualified
  species assertion supports the genus.~~ **Decided 2026-08-12** — the
  hedge-target rule, decision item 9 above. The originally proposed genus
  default was rejected as too coarse: every live hedge target resolves to a
  subgenus or finer, and `subsp.` refinements would have been wrongly demoted.

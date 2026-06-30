---
phase: quick-260630-ihl
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - data/species_maps.py
  - data/tests/test_species_maps.py
  - _data/species.js
  - src/tests/data-species.test.ts
autonomous: false          # Task 3 is a blocking human-verify (visible UI change)
requirements: [GENUS-SUBGEN-COLOR]
must_haves:
  truths:
    - "On a genus page for a genus with >=2 subgenera (e.g. Andrena), the map dots are colored by subgenus — at most one distinct color per subgenus, not ~one per species."
    - "Species in the same subgenus share one color on BOTH the SVG map and the page swatches."
    - "A genus with 0 or 1 distinct subgenus keeps the existing per-species coloring (unchanged)."
    - "Each species' page swatch color equals its dot color on the genus SVG map (swatch<->dot parity preserved)."
  artifacts:
    - path: "data/species_maps.py"
      provides: "Genus SVG colored by subgenus when the genus has >=2 subgenera"
      contains: "_generate_group_maps"
    - path: "_data/species.js"
      provides: "genusList colorByCanon assigns subgenus-bucketed colors for multi-subgenus genera"
      contains: "genusList"
    - path: "data/tests/test_species_maps.py"
      provides: "Test asserting genus SVG shares one fill per subgenus for a >=2-subgenus genus"
    - path: "src/tests/data-species.test.ts"
      provides: "Test asserting genus swatch colors bucket by subgenus + swatch parity"
  key_links:
    - from: "_data/species.js (hslToHex over sorted distinct subgenera)"
      to: "data/species_maps.py (_group_colors over sorted distinct subgenera)"
      via: "identical bucketing algorithm + identical input set (occurrence-bearing, epithet-bearing members)"
      pattern: "subgen"
---

<objective>
Color the genus-page occurrence map by SUBGENUS (one color per subgenus) for genera that
have multiple subgenera, instead of assigning a distinct hue to every species. Big genera like
Andrena (72 species / 18 subgenera), Lasioglossum (55 / 5), Osmia (51 / 5) and Megachile (28 / 8)
currently exhaust the categorical palette, producing near-identical adjacent hues that make the
map legend useless. Bucketing by subgenus reduces Andrena from ~72 hues to ~18 distinguishable
ones, with the existing per-subgenus `<h2>` section headings on the genus page acting as a
self-documenting legend.

Genera with 0 or 1 distinct subgenus keep the current per-species coloring (coloring a
single-subgenus genus by subgenus would make every dot one color — useless).

Purpose: make the genus-page map legible for the large genera where it is currently the least
useful, with zero new data dependency and zero UI-pattern additions.
Output: subgenus-bucketed coloring in the two parity-coupled producers (the Python SVG generator
and the build-time JS swatch feed), each guarded by a unit test.
</objective>

<scope_notes>
## What this is NOT (deliberate non-scope)

- **No dbt / `marts/occurrences` contract change.** `subgenus` is already a column in
  `marts/species` -> `public/data/species.parquet` -> `public/data/species.json`. The change is
  purely render-time in two files. The occurrences-contract release sequence and the
  "dbt build can't run locally" gate do NOT apply here.
- **No template change.** `_pages/genus.njk` already groups species under one `<h2>` per subgenus
  (`genus.subgenera`). We only change the per-species `hexColor` values; the template renders them
  unchanged. Do NOT add a new subgenus-legend chip or any new UI pattern
  (memory: `feedback_no_unrequested_ui_patterns`).
- **Subgenus pages, tribe maps, subfamily maps are untouched.** The subgenus page must keep
  per-species colors (within one subgenus you want species distinction). Subfamily maps already
  color by genus (D-06) — that proven pattern is the exact template for this change, one rank down.
- **Do NOT commit `public/data/species-maps/**`.** Those SVGs are pipeline-regenerated artifacts
  served from S3 nightly, not committed to git (memory: `feedback_no_committed_data_artifacts`).
  Local regeneration in Task 3 is for visual verification ONLY.

## The coloring rule (apply IDENTICALLY in both producers)

Given a genus's color-eligible members = species with `occurrence_count > 0` AND a real
`specific_epithet` (epithet not null):

1. `distinctSubgenera` = the set of non-empty `subgenus` values among those members.
2. If `len(distinctSubgenera) >= 2` -> **subgenus mode**:
   - Assign one hue per subgenus over the **sorted** distinct-subgenus list (same hue formula as
     today: evenly spaced hues, S=70/0.7, L=50/0.5).
   - Each species -> the color of its subgenus.
   - An epithet-bearing member with no subgenus -> grey `#aaaaaa` (ungrouped; none in current data
     but handle it). Unresolved members (epithet null) -> grey, as today. Checklist-only species
     (`occurrence_count == 0`, on_checklist) -> grey `#cccccc`, as today.
3. Else (0 or 1 distinct subgenus) -> **species mode**: unchanged current behavior (one hue per
   occurrence-bearing species).

## Parity is load-bearing (Pitfall 2)

The HTML swatch (`_data/species.js`) and the SVG dot (`data/species_maps.py`) MUST produce the
same color for the same species, or the legend lies. Guarantees:
- Both compute `distinctSubgenera` over the SAME member set (`occurrence_count > 0` + epithet
  present). Python currently colors over members that include checklist-only rows — so Task 1 adds
  `occurrence_count` to the SELECT and filters the subgenus set to occurrence-bearing members,
  matching JS's `withOcc`.
- Both sort the distinct-subgenus list plainly (Python `sorted()` <-> JS `.sort()`) — subgenus
  names are ASCII single words, so the orderings agree. This mirrors the existing subfamily->genus
  code (`sortedGeneraNames = sfGenera.map(g => g.name).sort()`).
- `_group_colors` (Python) and `hslToHex` (JS) are already documented as numerically equivalent;
  feeding them the sorted subgenus list instead of sorted canonical names changes the input, not
  the algorithm.
</scope_notes>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md
@data/species_maps.py
@_data/species.js
@data/tests/test_species_maps.py
@src/tests/data-species.test.ts
@_pages/genus.njk
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Color genus SVG maps by subgenus (>=2 subgenera) in species_maps.py</name>
  <files>data/species_maps.py, data/tests/test_species_maps.py</files>
  <behavior>
    - For a genus with >=2 distinct subgenera among occurrence-bearing epithet-bearing species:
      every species in a given subgenus produces `<g fill="...">` groups with the SAME fill;
      two species in different subgenera get DIFFERENT fills. (Mirror the existing
      `test_generate_group_maps_subfamily_genus_coloring` assertion shape, but for a genus map.)
    - For a genus with exactly 1 distinct subgenus: per-species coloring is retained (two species
      in the same single subgenus get DIFFERENT fills — proves species-mode, not subgenus-mode).
    - Determinism preserved: two runs produce byte-identical genus SVGs.
    - Existing fixture (`_write_test_species_parquet`: Andrena has 1 distinct subgenus 'Melandrena';
      Bombus has 1 distinct subgenus 'Pyrobombus') therefore stays in species mode — all existing
      tests in test_species_maps.py must still pass unchanged.
  </behavior>
  <action>
    In `_generate_group_maps`, add `occurrence_count` to the species.parquet SELECT. While iterating
    rows, build two helper maps alongside the existing membership dicts: `subgenus_of` (canonical_name
    -> cleaned subgenus or None, treating empty/whitespace as None per the existing PATTERNS #3 guard)
    and `occ_count_of` (canonical_name -> occurrence_count). In the genus loop, compute
    `distinct_subgen = sorted({ subgenus_of[c] for c in members if occ_count_of.get(c, 0) > 0 and c not in unresolved and subgenus_of.get(c) })`.
    When `len(distinct_subgen) >= 2`, build `subgen_colors = _group_colors(distinct_subgen)` (this
    yields one hex per subgenus NAME) and set `colors[c]` for each member to `subgen_colors[subgenus_of[c]]`
    when the member has a subgenus and is not unresolved, else `_UNRESOLVED_COLOR`. When
    `len(distinct_subgen) < 2`, keep the existing branch verbatim (`_group_colors(members)` then
    overwrite unresolved -> `_UNRESOLVED_COLOR`). Do not change `_write_group_svg`, the subgenus/tribe/
    subfamily loops, or the per-species SVG path — only the genus loop and the SELECT. Reuse the proven
    subfamily->genus pattern (D-06) as the structural model. Add a new test (and a small dedicated
    multi-subgenus fixture, e.g. a genus with subgenera A and B each holding >=2 species) asserting the
    subgenus-mode shared-fill behavior and a single-subgenus genus staying per-species; do not modify
    the existing `_write_test_species_parquet` fixture (keep it single-subgenus so existing assertions
    hold).
  </action>
  <verify>
    <automated>cd data && uv run pytest tests/test_species_maps.py -x</automated>
  </verify>
  <done>New subgenus-mode + single-subgenus tests pass; all pre-existing test_species_maps.py tests still pass; genus SVG for a >=2-subgenus genus shares one fill per subgenus.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Mirror subgenus-bucketed coloring in _data/species.js genusList (swatch parity)</name>
  <files>_data/species.js, src/tests/data-species.test.ts</files>
  <behavior>
    - In the real species.json, a multi-subgenus genus (e.g. Andrena) yields `genusList` species
      whose `hexColor` is identical for all species sharing a subgenus, and differs across subgenera
      (>=2 distinct swatch colors for Andrena).
    - A genus with 0 or 1 distinct subgenus retains distinct per-species `hexColor` values
      (species mode unchanged).
    - The synthetic "Genus sp." entry stays `#aaaaaa`; checklist-only species stay `#cccccc`.
    - Independently recompute the expected subgenus color with the test's reference `hslToHex`
      (already present in data-species.test.ts) over the sorted distinct-subgenus list and assert it
      equals the species' `hexColor` — this is the swatch<->dot parity contract.
  </behavior>
  <action>
    In `genusList`'s `.map(g => ...)`, after `withOcc` is computed, replace only the construction of
    `colorByCanon`. Compute `distinctSubgenera` = the sorted, de-duplicated set of non-empty `subgenus`
    values among `withOcc` members that have `specific_epithet !== null`. If `distinctSubgenera.length >= 2`,
    build `subgenusHex` by indexing `hslToHex(i * 360 / distinctSubgenera.length, 70, 50)` over the
    sorted subgenus list (copy the existing subfamily->genus block: `const sorted = [...set].sort();`),
    then set `colorByCanon[canonical_name]` for each `withOcc` member to its subgenus color when it has
    an epithet and a subgenus, else `#aaaaaa` (unresolved or epithet-bearing-without-subgenus). Otherwise
    (0 or 1 subgenus) keep the existing per-species expression
    (`sp.specific_epithet !== null ? hslToHex(i*360/n,70,50) : '#aaaaaa'`). Everything downstream
    (`speciesOnly`, `checklistSpecies`, the synthetic "Genus sp." push, the `subgenera`/`ungroupedSpecies`
    partition) is unchanged — it already reads `hexColor` from `colorByCanon`. Do NOT touch `subgenusList`
    (the subgenus page must keep per-species colors). Add a test in data-species.test.ts that pulls a
    real multi-subgenus genus from `species.genusList`, groups its `species` by `subgenus`, and asserts
    (a) one distinct hexColor per subgenus, (b) >=2 distinct colors overall, (c) the recomputed
    reference color matches.
  </action>
  <verify>
    <automated>npx vitest run src/tests/data-species.test.ts</automated>
  </verify>
  <done>New parity test passes; Andrena (and other >=2-subgenus genera) swatches bucket by subgenus; single/no-subgenus genera unchanged; full `npm test` stays green.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <what-built>
    Genus-page maps now color occurrence dots by subgenus (one color per subgenus) for genera with
    >=2 subgenera; single/no-subgenus genera are unchanged. Both the SVG map dots (Python) and the
    page swatches (JS) were updated together so they agree.
  </what-built>
  <how-to-verify>
    1. Regenerate the genus SVGs locally from the present parquet/duckdb (confirmed runnable — 39 WA
       counties + all parquets present):
         cd data && uv run python species_maps.py
       (This rewrites public/data/species-maps/** — a gitignored, pipeline-owned artifact. Do NOT
       commit it.)
    2. Start the dev server: npm run dev  (note the URL it prints).
    3. Open /species/Andrena/ . Confirm:
       a. The map shows dots in roughly a dozen-plus clearly distinguishable colors grouped by
          subgenus — NOT ~72 near-identical hues as before.
       b. In the members list, within each subgenus <h2> section every species swatch is the SAME
          color; different subgenus sections have different colors.
       c. Spot-check one species: its swatch color matches its dots on the map (parity).
    4. Open a small single-subgenus or few-species genus (e.g. /species/Agapostemon/) and confirm its
       coloring is UNCHANGED (still per-species).
    5. Optionally check /species/Lasioglossum/ and /species/Osmia/ (the other big genera) for the
       same subgenus bucketing.
    6. After verifying, discard the regenerated artifacts: git checkout -- public/data/species-maps
       (or leave them — they are gitignored; just do not stage them).
  </how-to-verify>
  <resume-signal>Type "approved", or describe what looked wrong (colors not bucketing, swatch/dot mismatch, a single-subgenus genus that changed, etc.)</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| (none new) | Build-time transform of already-trusted internal taxonomy data (species.parquet / species.json). No untrusted input crosses any boundary; no network, no external service, no package install, no user-supplied data. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-ihl-01 | Tampering | swatch<->dot color parity drift between _data/species.js and data/species_maps.py | mitigate | Both producers use the identical bucketing rule + input set; parity asserted by the new data-species.test.ts reference-color check and the species_maps.py shared-fill test. |
| T-ihl-02 | (none) | no package installs in this plan | accept | No npm/pip/cargo install tasks; no legitimacy audit required. |
</threat_model>

<verification>
- `cd data && uv run pytest tests/test_species_maps.py -x` passes (Task 1).
- `npx vitest run src/tests/data-species.test.ts` passes (Task 2).
- Before any push (memory `feedback_run_tests_before_push`): run BOTH suites for the changed
  languages — `npm test` (JS changed) AND `cd data && uv run pytest -m "not integration"` (data
  changed). Both green.
- Human-verify checkpoint approved: Andrena map + swatches bucket by subgenus; small genus unchanged.
</verification>

<success_criteria>
- Genus pages for genera with >=2 subgenera color the map dots by subgenus (<= number-of-subgenera
  distinct colors), with per-subgenus monochromatic swatch sections.
- Genera with 0 or 1 distinct subgenus keep per-species coloring.
- Swatch color == SVG dot color for every species (parity preserved), enforced by tests.
- No dbt/contract change; no template change; no committed public/data artifacts; `npm test` and the
  non-integration pytest suite are green.
</success_criteria>

<source_audit>
Single source: the user task statement ("Where a genus has multiple subgenera, let's color the
subgenera, not every species in the genus").

| Item | Source | Covered by |
|------|--------|-----------|
| Color genus map by subgenus when genus has multiple subgenera | TASK | Task 1 (SVG) + Task 2 (swatch) |
| Keep per-species coloring when genus has <=1 subgenus | TASK (implied edge rule) | Task 1 + Task 2 species-mode branch |
| Swatch/dot parity must hold | RESEARCH (Pitfall 2, existing invariant) | Task 1 + Task 2 + tests; Task 3 visual spot-check |

No unplanned items. No items deferred. No phase split needed.
</source_audit>

<output>
Commit ONLY: data/species_maps.py, data/tests/test_species_maps.py, _data/species.js,
src/tests/data-species.test.ts. Do NOT stage public/data/species-maps/**.
Write a brief SUMMARY noting the subgenus-mode rule, the >=2 threshold, and confirmation that no
contract/template change was needed.
</output>

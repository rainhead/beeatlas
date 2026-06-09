# Phase 145: add npm and python deps to dependabot - Context

**Gathered:** 2026-06-09
**Status:** Ready for planning
**Source:** Inline design questions (trivial single-file config phase — no discuss-phase / research)

<domain>
## Phase Boundary

Extend `.github/dependabot.yml` so Dependabot version updates cover all three
dependency ecosystems in this repo:

1. **npm** — root `package.json` / `package-lock.json`
2. **Python** — the `data/` uv project (`pyproject.toml` + `uv.lock`)
3. **GitHub Actions** — already present; gets grouping retrofitted

This phase changes **only** `.github/dependabot.yml`. No app code, no pipeline
code, no workflow files. Verification is config-shape and YAML-validity only —
Dependabot itself runs on GitHub, not locally.

</domain>

<decisions>
## Implementation Decisions

### Ecosystems
- **D-01** — Add an npm `package-ecosystem` entry rooted at `directory: "/"`
  (root `package.json` / `package-lock.json`).
- **D-02** — Add a Python entry using native uv support:
  `package-ecosystem: "uv"`, `directory: "/data"` (the uv project lives in
  `data/`, per `data/pyproject.toml` + `data/uv.lock`). Do NOT use the legacy
  `pip` ecosystem — `uv` is the correct identifier for a uv.lock project.

### Grouping
- **D-03** — Group **minor + patch** updates into a single PR per ecosystem;
  leave **major** version bumps ungrouped (individual PRs) so breaking changes
  stay reviewable in isolation. Implemented via a `groups:` block with
  `update-types: ["minor", "patch"]`.
- **D-05** — Apply the same minor+patch grouping to the **existing
  github-actions** entry, for consistency across all three ecosystems.

### Schedule
- **D-04** — All three ecosystems use `schedule.interval: "weekly"`, matching
  the existing github-actions cadence.

### Claude's Discretion
- Group names (e.g. `npm-minor-patch`, `python-minor-patch`,
  `actions-minor-patch`).
- `open-pull-requests-limit` (default 5 is fine unless a reason to change).
- Ordering of entries within the `updates:` list.
- Whether to add brief inline comments documenting each ecosystem block.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Config under change
- `.github/dependabot.yml` — the only file modified; currently a `version: 2`
  config with a single `github-actions` entry on a weekly schedule.

### Manifests that anchor the new entries
- `package.json` / `package-lock.json` (repo root) — npm ecosystem target.
- `data/pyproject.toml` / `data/uv.lock` — Python/uv ecosystem target.

</canonical_refs>

<specifics>
## Specific Ideas

Resulting `.github/dependabot.yml` should have three `updates:` entries
(github-actions, npm, uv), each weekly, each with a `groups:` block grouping
minor+patch. Reference Dependabot grouped-updates syntax:
`groups.<name>.update-types: ["minor", "patch"]`.

</specifics>

<deferred>
## Deferred Ideas

None — this phase fully covers its scope (three ecosystems, grouped + weekly).

</deferred>

---

*Phase: 145-add-npm-and-python-deps-to-dependabot*
*Context gathered: 2026-06-09 via inline design questions*

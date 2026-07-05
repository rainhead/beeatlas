# Issue tracker: beads (local-only)

BeeAtlas is a solo project with no customer issue inbox. All work — features, bugs, tech debt, in-flight tasks — is tracked in **beads (`bd`)**. There is no GitHub Issues workflow here.

Beads is **local-only**: issues live in a Dolt DB under `.beads/` (gitignored); they do not travel with git. `bd` is the interface.

## Conventions (via `bd`)

- Create: `bd create "title" -t <bug|task|feature|epic> -p <0-3> -d "..."`
- Frontier: `bd ready` · Show: `bd show <id>` · List: `bd list --status open --json`
- Update/close: `bd update <id> --status <state>` · `bd close <id> --reason "..."`
- Link/provenance: `bd dep add <blocked> <blocker>` · `--parent <epic>` · `--deps discovered-from:<id>`

## When a skill says "publish to the issue tracker"

Create a beads issue (`bd create`). A PRD or broken-down plan becomes a bd epic + child issues.

## When a skill says "fetch the relevant ticket"

`bd show <id>` (e.g. `bd show beeatlas-9xi`).

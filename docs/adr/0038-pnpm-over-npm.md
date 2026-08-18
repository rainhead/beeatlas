# 0038 — pnpm replaces npm as the package manager

Date: 2026-08-18
Status: Accepted
Issues: beeatlas (pnpm migration)
Related: [salishsea-io decision 025](https://github.com/rainhead/salishsea-io/blob/main/docs/decisions/025-pnpm-over-npm.md), which this follows

## Context

`npm` is the package manager for three separate Node trees here — the site build at
the root, the pipeline's tooling in `data/`, and the CDK project in `infra/` — and
its lockfile is not reliably host-independent.

`package-lock.json` is *meant* to reproduce one tree everywhere. But `npm install`
writes the lockfile from the tree it just built **for the current host**, pruning
optional dependencies that do not apply. Packages reachable only through a
platform-specific optional dependency therefore vanish from the lockfile when it is
regenerated on macOS, and linux CI then fails resolving a tree the lock cannot
describe. This is [npm/cli#4828](https://github.com/npm/cli/issues/4828), open since
2022. salishsea-io hit it twice in one day and migrated for that reason; this repo
has the same three-tree shape and the same laptop-writes/linux-runs asymmetry, and
its lockfiles feed a **production nightly** rather than only CI.

The workaround — always regenerate with `npm install --package-lock-only --os=linux
--cpu=x64` — is an unwritten rule enforced by nothing, and every Dependabot PR is
another chance to forget it.

The immediate trigger was operator patience rather than an outage: npm's behaviour
here is a standing tax, and the repo it is being aligned with had already paid to
remove it.

## Decision

**pnpm is the package manager at all three levels.** `pnpm-lock.yaml` records every
platform variant unconditionally, so a lockfile written on macOS resolves identically
on linux. The failure mode is absent rather than avoided by discipline.

- **`packageManager: pnpm@11.22.0`** in the root `package.json`. `pnpm/action-setup`
  reads it, so CI and laptops run one pnpm without a version pinned in three
  workflows. (salishsea-io is on 11.20.0; this is simply the installed version, and
  the lockfile format — v9 — is the same.)
- **`pnpm install --frozen-lockfile`** replaces `npm ci` everywhere. Same contract:
  fail rather than silently rewrite the lockfile.
- **`data/` and `infra/` stay separate projects, not workspace members.** `data/`
  exists precisely to keep 217 packages and two native addons out of the tree Vite
  bundles (beeatlas-dqh); making it a workspace member would undo that, because
  `pnpm install` at a workspace root installs every member. pnpm resolves a workspace
  root by walking UP for a `pnpm-workspace.yaml`, so each needs one of its own —
  without it the root file claims the directory and `pnpm install` there reports
  "Already up to date" having installed **nothing**, which surfaces only later and
  somewhere else. Each of those files must declare at least one key: a comments-only
  YAML document parses to `null` rather than an empty mapping, and Dependabot's
  `npm_and_yarn` file fetcher indexes it unguarded.
- **Install scripts are allowlisted** in `pnpm-workspace.yaml` (`allowBuilds`). pnpm
  refuses to run a dependency's install script unless it is named, so a compromised
  transitive package cannot execute code merely by entering the tree. Every package
  that ships one must be adjudicated true **or** false — an unlisted one is
  `ERR_PNPM_IGNORED_BUILDS` and exit 1, which fails `--frozen-lockfile` in every
  workflow. That friction is intended: letting a package run code at install time is
  a decision, so it gets written down.
- **Both native addons in `data/` are denied.** `better-sqlite3` (mapshaper's
  GeoPackage support, via `@ngageoint/geopackage`) and `msgpackr-extract` (an
  optional accelerator with a pure-JS fallback) are the only packages here with
  install scripts. This pipeline reads and writes GeoJSON only; verified 2026-08-18
  that a real `-clean -simplify -o` run over `counties.clean.geojson` succeeds with
  both denied, and the full data suite passes.
- **`package-lock.json` is deleted at all three levels.** Keeping one would let
  `npm install` succeed and reintroduce exactly the drift this removes.

The migration is **dependency-neutral**: every direct dependency is pinned to the
version its `package-lock.json` had. pnpm's fresh resolution wanted `maplibre-gl`
6.4.0, `aws-cdk-lib` 2.265.0 and `aws-cdk` 2.1137.0; all three were held at the
locked versions. A package-manager swap should not also be a dependency bump —
especially not of the renderer, which was regression-tested at 6.3.0 the same day.
Dependabot will offer those upgrades on its own schedule, with their own review.

## Consequences

**`node_modules` is no longer flat.** Anything relying on an undeclared transitive —
a "phantom dependency" — now fails at resolution instead of working by accident.
Exactly one did: `src/tests/basemap-precache.test.ts` imports `glob`, which it uses
deliberately because it is *workbox's own globber*, so the precache test cannot drift
from what ships. npm supplied it by hoisting. It is now a declared devDependency at
`^11.1.0`, the version workbox resolves today. The coupling that made hoisting
attractive is now explicit rather than accidental, and if workbox's glob major ever
moves, this pin has to move with it — which is visible, where before it was not.

**The nightly's node_modules cache is gone, and that is a fix rather than a
simplification.** `_npm_sync` hashed `package-lock.json` and skipped the install when
it matched, because `npm ci` wipes `node_modules` and so recompiled both native
addons every run — a multi-minute hit. Neither half is true now: pnpm reconciles an
existing tree from a content-addressed store, and nothing compiles. Removing the
guard also fixes something it was quietly wrong about: keyed on the *lockfile*, a
corrupt or half-installed `node_modules` still matched the hash and the install was
skipped, so the failure surfaced later and elsewhere. An unconditional frozen install
verifies the tree every night, which is what a publish gate should do. The stale
`.npm-lock-hash` files on maderas are inert; the `.gitignore` entry is kept so a
checkout that still has one stays clean.

**`scripts/build-app.mjs` keys its bundle fingerprint on `pnpm-lock.yaml` now.** This
is load-bearing and easy to miss: the file is a direct input to the bundle-reuse gate
(ADR 0019), and leaving it pointed at a file that no longer exists would hash as
absent, so a dependency bump would stop triggering a rebuild and the gate would reuse
a stale bundle nightly.

**`--silent` moves.** npm parses its own flags anywhere on the line; pnpm passes
anything after the script name to the script. `npm run build --silent` therefore had
to become `pnpm run --silent build` in `infra/package.json` and in `cdk.json`'s app
command, or `tsc` receives `--silent` and fails.

**Contributors must have pnpm.** `npm install` in this repo is now a mistake rather
than a slower path to the same place.

Historical ADRs that mention `npm run …` are left as written. They record decisions
made when that was the command; the scripts they name are unchanged.

## Alternatives rejected

**Stay on npm and enforce the flags.** The status quo plus vigilance. Vigilance is
what the referenced project already watched fail, and here the blast radius includes
a nightly that publishes.

**Make `data/` and `infra/` workspace members.** A single root manifest is reached
automatically by tooling that otherwise must be pointed at each project. But
`pnpm install` at a workspace root installs every member, so the JS test workflow
would start pulling `aws-cdk-lib` and mapshaper's 218 packages — undoing beeatlas-dqh,
whose entire purpose was separating those trees. Dependabot already has an entry per
directory, which buys the same coverage without the coupling.

**Yarn Berry / Bun.** Both immune to the same bug. Yarn's distinguishing feature is
Plug'n'Play, which fights Vite; setting `nodeLinker: node-modules` forfeits the reason
to prefer it. Bun adds a second JavaScript runtime to the CI surface to solve a
dependency-resolution problem. Neither matches what salishsea-io runs, and matching it
is most of the value here.

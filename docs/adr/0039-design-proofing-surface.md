# 0039 — /design proofs components from fixtures

Date: 2026-08-27
Status: Accepted
Issues: beeatlas-ftme

## Context

Every state of the occurrence detail card had to be reached by driving the real
app: find a point whose records happen to have two collectors, or a checklist
record with a verbatim name that differs from the accepted one, or a selection
spanning two ecoregions. Some states are practically unreachable that way — an
occurrence whose place membership has not resolved yet exists for a few hundred
milliseconds, and the "no membership at all" case survives on one record in the
whole database.

The result was that changes to the card were verified against whichever state
the author happened to open. The shared-place roll-up (beeatlas-cna1) was the
prompt: five card variants and three membership arrangements, and the only way
to see them side by side was five URLs and a stale local database.

Beeline solved the same problem with `/design`: a section register shared by
the nav, the route table and a test, and a `qc-proof` page rendering the real
component from fixture data, one panel per state.

## Decision

**BeeAtlas gets `/design`, and it proofs components from typed fixtures — never
from the database.**

- **A state is a fixture plus a render function** (`src/design/proofs.ts`). The
  proofed presenters are pure functions of their properties, so every state is
  reachable by constructing props. That is the property the surface protects: a
  state that cannot be reached this way marks a component that has stopped being
  a presenter, and the fix is the component, not the fixture.
- **The section list is a single register** (`_data/design.js`), read by the
  index page, the paginated section pages, their nav, and a test that checks it
  against the `PROOFS` registry in both directions. A section cannot be listed
  with nothing to show, or shown without being listed.
- **The fixtures are the test fixtures** (`src/design/fixtures.ts`). One builder
  writes `OccurrenceRow` out in full, so a fixture cannot quietly omit a column
  the contract requires, and unit tests and proofs cannot drift apart.
- **The proof states are themselves a test.** `src/tests/design.test.ts` mounts
  every registered state under happy-dom. A state that throws fails CI rather
  than the page.
- **It ships to the live site, unlinked.** It is static HTML and one small JS
  entry; shipping it is what makes on-device proofing possible, which matters
  because most of what recently broke — offline cold start, touch targets, PWA
  storage — only misbehaves on a real phone. It is absent from the header nav.

## The constraint that shapes it

`src/entries/design.ts` **must not reach the app shell.** `vite.config.ts`'s
input list exists to make it impossible for a template to mount the map without
registering the service worker (ADR 0029), and a page whose whole purpose is
mounting components is the likeliest one to do that by accident. Two rules fall
out, both pinned by tests:

- No import of `bee-atlas`, `app-entry`, `bee-map`, `sw-registration`, or
  `prime-orchestrator`.
- `filter.ts` is imported for **types only**. A value import pulls `sqlite.ts`,
  and with it the *inlined* wa-sqlite worker — megabytes onto a page that shows
  fixtures. This is why the proofed card is handed `filterState: null`; its
  record-menu button renders either way, and only acting on it needs the state.

## Rejected alternatives

- **Storybook or similar.** A second build pipeline, a second component
  registry, and a dev-only surface that cannot be opened on a phone. The whole
  cost of this decision is one Eleventy template, one Vite entry and a
  stylesheet, because the site already builds static pages.
- **Screenshot/visual-regression tests instead.** They answer "did this change?"
  — valuable, and orthogonal. They do not answer "what does this state look
  like?", which is the question that was being answered by driving the app.
- **Proofing against the real database.** It would drag the data layer onto the
  page, make states depend on whatever the nightly last published, and leave the
  rare states as unreachable as they are today.
- **Dev-only (excluded from the production build).** Rejected for the on-device
  reason above; the page reads no records and decides nothing, so there is
  nothing to gate.

## Consequences

- A new component state gets a proof state in the same change, and the section
  register is where a new component announces itself.
- Sections beyond the occurrence detail card — tokens, `<bee-pane>` modes,
  `<bee-notes>` auth states — are additive: a list entry and a `PROOFS` key.
- `/design` is public. It carries no data and no identity, but it does show
  fixture records; those are invented, and must stay invented.

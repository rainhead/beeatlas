# Phase 147: `/app` Route + SW Topology - Context

**Gathered:** 2026-06-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Stand up an unlisted `/app/` route served by Eleventy and establish a correctly-scoped
service worker at `/app/sw.js` (`scope: '/app'`). The main `/` route must have **no**
service worker. CloudFront must serve `/app/sw.js` and `/app/manifest.webmanifest` with a
`no-cache` directive so SW/manifest updates are not delayed by the default long-TTL.

This phase delivers **topology, not caching** — the SW proves scope and `/data/*` intercept
but caches nothing. App-shell precache (Phase 148), `/data/` runtime caching (Phase 149),
and the real `manifest.webmanifest` content/icons (Phase 151) are out of scope here.

Requirements **ROUTE-01, ROUTE-02, ROUTE-03 are locked** (see REQUIREMENTS.md). This
discussion clarifies HOW to implement them.

</domain>

<decisions>
## Implementation Decisions

### Page content & Vite entry
- **D-01:** `/app` renders the **full existing `<bee-atlas>` SPA** from this phase (the same
  component served at `/`), via a new `_pages/app/index.html` that mirrors the existing
  `_pages/index.html` SPA-template pattern. Topology and a working app land together; 148+
  then caches a real shell rather than a placeholder.
- **D-02:** A new Vite entry `src/app-entry.ts` is the `/app` page's module entry — it imports
  `<bee-atlas>` **and** the SW registration. `_pages/app/index.html` references
  `./src/app-entry.ts`, not `./src/bee-atlas.ts` directly. This establishes the dedicated
  entry boundary that `vite-plugin-pwa` `injectManifest` will hook in Phase 148.

### SW scope & registration placement
- **D-03:** SW registration lives in `src/sw-registration.ts`, imported **only** by
  `src/app-entry.ts`. Because `/` loads `src/bee-atlas.ts` via `_pages/index.html` (which never
  imports the registration module), `/` structurally never registers a SW — the no-SW-on-`/`
  guarantee is enforced by import topology, not by runtime guards. Call:
  `navigator.serviceWorker.register('/app/sw.js', { scope: '/app' })`.
- **D-04:** The SW file is served at `public/app/sw.js` — a Vite passthrough, **unhashed**, at a
  stable URL (required for the browser's SW update detection). No `Service-Worker-Allowed`
  header is needed: scope defaults to `/app/` from the script's location, and scope governs
  *pages*, not which fetches the handler can intercept (research ARCHITECTURE §1).

### Phase-147 SW content (nothing cached)
- **D-05:** `public/app/sw.js` is a **minimal hand-written stub** for this phase: `install` /
  `activate` listeners plus a **pass-through `fetch` handler** (`event.respondWith(fetch(event.request))`,
  no caching). The pass-through handler concretely demonstrates that the SW intercepts
  `/data/*` requests issued by the `/app` page (DevTools shows the SW as the initiator),
  satisfying ROUTE-02 criterion 4. Workbox / `injectManifest` wiring is deferred to Phase 148.
- **D-06:** No `skipWaiting` / `clientsClaim`, even in the stub — preserves the OFF-03
  prompt-to-reload update lifecycle invariant from day one (no app-code↔DB version skew).

### Unlisting `/app`
- **D-07:** `/app` is unlisted by `eleventyExcludeFromCollections: true` front matter plus no
  link from nav, home, or sitemap. **No `noindex` meta and no robots.txt entry** — rely on the
  absence of inbound links during dogfooding; trivially reversible later (add `noindex` if it
  ever surfaces somewhere it shouldn't). User explicitly accepted the full-SPA + unlinked-only
  exposure. Satisfies ROUTE-01.

### CloudFront no-cache (CDK)
- **D-08:** Add CloudFront behaviors for **both** `/app/sw.js` **and** `/app/manifest.webmanifest`
  in this phase. The manifest file itself does not land until Phase 151, but the behavior is
  path-pattern based and harmless before the file exists — ROUTE-03 is completed in one infra
  change with no revisit to `beeatlas-stack.ts` in 151.
- **D-09:** Implement via a shared `ResponseHeadersPolicy` setting
  `Cache-Control: no-cache, no-store, must-revalidate` (`customHeadersBehavior`, override=true)
  plus a zero-TTL `CachePolicy`, applied to both path behaviors. This mirrors the existing
  `/data/*` `addBehavior` + `ResponseHeadersPolicy` + `CachePolicy` pattern already in
  `infra/lib/beeatlas-stack.ts`.

### Verification
- **D-10:** ROUTE-03 is gated by a **`cdk synth` template-assertion test** in the suite (asserts
  the no-cache behavior/headers exist on both paths) **plus** a post-deploy `curl -I` spot-check
  on the live distribution recorded in HUMAN-UAT. The assertion catches future infra
  regressions without deploying; the curl confirms reality once live.
- **D-11:** ROUTE-02 (SW attached to `/app`, none on `/`; SW initiates a `/data/*` fetch) is
  verified in DevTools → Application/Network against a **local production-build preview** on
  `http://localhost` before deploy (SW works on localhost). Documented as manual UAT steps.
- **D-12:** Criterion 1 (page loads, `/` unchanged, unlisted) is verified via a local build check.

### Claude's Discretion
- Exact CDK construct IDs/naming for the new policies and behaviors.
- The precise pass-through stub SW source and how `app-entry.ts` composes `<bee-atlas>` +
  registration.
- Test file placement/naming for the CDK assertion.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Locked requirements & phase scope
- `.planning/REQUIREMENTS.md` — ROUTE-01/02/03 locked requirement text (read before planning).
- `.planning/ROADMAP.md` (Phase 147 entry, ~line 1139) — goal + 4 success criteria.

### Service-worker topology (authoritative)
- `.planning/research/ARCHITECTURE.md` §1 "SW Scope vs `/data/` Intercept" — the decisive fact:
  scope governs which *pages* the SW controls, not which fetches it intercepts; `/app`-scoped SW
  fully intercepts `/data/*` with no `Service-Worker-Allowed` header.
- `.planning/research/ARCHITECTURE.md` §1a (file-location options table, "Option A") and the
  file-roles table (~lines 256–259: `_pages/app/index.html`, `src/app-entry.ts`,
  `src/sw-registration.ts`, `public/app/sw.js`).
- `.planning/research/SUMMARY.md` — overall approach + new-files inventory (~lines 68–69),
  and the SW-scope/`no-cache` resolution notes (~lines 99–107, 121–124).
- `.planning/research/PITFALLS.md` — Pitfall 1 (SW scope bleed onto `/`), the
  `sw.js`-must-not-be-hashed pitfall (serve from `public/app/`), and Pitfall 3
  (`vite-plugin-pwa` must be wired in `eleventy.config.js`, not `vite.config.ts` — relevant to
  148 but constrains the 147 entry structure).

### Infra pattern
- `infra/lib/beeatlas-stack.ts` (lines ~53–91) — existing `/data/*` `addBehavior` +
  `ResponseHeadersPolicy` + `CachePolicy` is the direct analog for the new no-cache behavior.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `_pages/index.html` — the SPA-entry template pattern to mirror for `_pages/app/index.html`.
  **Load-bearing detail (eleventy.config.js comments):** the SPA entry must be an Eleventy
  *template* (not a passthrough) or `@11ty/eleventy-plugin-vite` skips its Vite build pass
  (`results.length === 0`); and `public/` is copied via a two-step Eleventy-passthrough →
  Vite-`publicDir` mechanism — `public/app/sw.js` rides this and survives Vite's rename-and-build.
- `src/bee-atlas.ts` / `<bee-atlas>` — reused verbatim at `/app` (D-01); no changes to the
  component itself.

### Established Patterns
- `eleventy.config.js` Vite-plugin wiring (`viteOptions`, `addPassthroughCopy({src:"src"})`);
  Phase 148 will add `viteOptions.plugins` here, so keep the 147 entry compatible.
- `infra/lib/beeatlas-stack.ts` `/data/*` behavior is the template for D-08/D-09.

### Integration Points
- **New:** `_pages/app/index.html`, `src/app-entry.ts`, `src/sw-registration.ts`,
  `public/app/sw.js`.
- **Modified:** `infra/lib/beeatlas-stack.ts` (two new CloudFront behaviors + shared policies).
- **Untouched:** `_pages/index.html`, `src/bee-atlas.ts` entrypoint wiring for `/` (the no-SW
  guarantee depends on `/` not importing the registration module).

</code_context>

<specifics>
## Specific Ideas

- The pass-through `fetch` handler is deliberately chosen over a bare (no-fetch-handler) SW so
  ROUTE-02 criterion 4 (DevTools shows the SW as initiator for a `/data/*` fetch) is concretely
  demonstrable in this phase rather than left as an assertion about a later phase.
- User accepts the most-discoverable combination (full SPA + unlinked, no `noindex`) for
  dogfooding, on the reasoning that no inbound links ≈ no crawler path, and it's reversible.

</specifics>

<deferred>
## Deferred Ideas

- App-shell precache + `vite-plugin-pwa` `injectManifest` wiring → **Phase 148** (the real
  `public/app/sw.js` replaces the 147 stub).
- `/data/` runtime caching (`occurrences.db` + GeoJSON, `CacheFirst`, raised file-size cap) →
  **Phase 149**.
- Real `manifest.webmanifest` content + icons + installability → **Phase 151** (the no-cache
  behavior for it is added now per D-08).
- Adding `noindex`/robots if the dogfood route ever needs to be hardened against indexing.

### Reviewed Todos (not folded)
- `144-code-review-deferred.md` — "Phase 144 code-review deferred items (WR-04 CSV-export
  headers + 3 info)" (match score 0.6). **Not folded:** the match is a keyword false-positive
  on "phase"; CSV-export header work is unrelated to `/app` route / SW topology.

</deferred>

---

*Phase: 147-app-route-sw-topology*
*Context gathered: 2026-06-10*

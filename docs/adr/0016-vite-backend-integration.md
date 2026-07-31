# ADR 0016: Vite builds the app, Eleventy builds the HTML, and they meet at a manifest

**Status:** Accepted (implemented 2026-07-31; issue beeatlas-d3y, epic beeatlas-0gx)

---

## Context

The site build ran Eleventy and then `@11ty/eleventy-plugin-vite`, which renamed
`_site/` to `.11ty-vite/`, ran Vite over it in `appType: "mpa"`, and wrote the result
back. Every one of the 1668 generated pages was therefore a **Vite entry point**, and
anything Vite did not re-emit was destroyed.

That coupling was priced when a note write became a synchronous publish (ADR 0007,
`st-nee`): a note write commits, then rebuilds the site before responding. Measured on
maderas, that path is **25.9s**, of which ~22s is the render — and the current
latency, not correctness, is what stops us advertising the site and inviting authors
to write notes.

Measuring where the render actually goes (2026-07-30, local, 1668 files, 10.85s):

| phase | local | note-dependent? |
|---|---:|---|
| Eleventy startup + all `_data` | ~1.0s | `notes.js` is 1ms |
| render `species-detail.njk` (591 pp) | 1.40s | **yes** |
| all other templates | 1.08s | no |
| passthrough copy (1371 files) | 0.44s | no |
| **Vite pass** | **5.58s** | **no** |
| PWA service worker | 0.50s | no |

Note-dependent work is **13%** of the build. The expected lever — rendering only the
species pages a note touched — is worth ~1.4s and cannot reach an acceptable write
path. The Vite pass, which cannot be affected by a note at all, is 56%.

An app-only Vite build with explicit module inputs and no HTML entries was then
measured at **1.00s** producing the same chunks. So ~4.6s of that 5.58s was Vite
reprocessing HTML.

## Decision

**Vite builds the app; Eleventy builds the HTML; they meet at `manifest.json`.** This
is Vite's documented "backend integration" mode.

1. `vite build` takes the **seven entry modules** the templates reference
   (`build.rollupOptions.input`) and writes a manifest. No HTML reaches Vite.
2. Eleventy emits the hashed `<script>`/`<link>` tags itself, from that manifest, via
   a `{% viteAssets "src/…" %}` shortcode (`lib/vite-manifest.js`). Tag shape follows
   Vite's backend-integration guidance: a module script for the entry, `modulepreload`
   for its transitive static imports, a stylesheet link per CSS file.
3. **Step order is load-bearing.** `build:app` must precede Eleventy, which reads the
   manifest at data-load time. The service worker moved to a second Vite pass
   (`vite.sw.config.ts`) that must *follow* Eleventy, because `vite-plugin-pwa`'s
   `injectManifest` globs the built site and precaches `app/index.html`.
4. The manifest is stashed at `.cache/beeatlas-vite/manifest.json` — outside `_site`
   so build metadata is never published, and outside `node_modules` so `npm ci` cannot
   destroy it. It must **outlive a build**: rerunning Eleventy alone is the point.
5. `build.emptyOutDir` is **on**. See Consequences.

Measured after: full build ~12s → **6.6s**; Eleventy alone 10.4s → **3.7s**; the Vite
step 5.58s → **0.59s**; passthrough 1371 files → 6.

## Consequences

**The app build is now the only thing that cleans `_site`.** The plugin's
rename-and-build reset the output as a side effect. Removing the plugin removed that,
and the first implementation left `emptyOutDir: false` — so a second build kept *both*
the old and new `app-entry-<hash>.js`, and the service worker precached both (21 asset
URLs against 15), shipping dead chunks to every install, unbounded across builds.
`emptyOutDir: true` restores the old semantics: **a full build is the cleaning
boundary; a bare `eleventy` rerun is deliberately additive.** A consequence of the
consequence: running `build:app` alone wipes the rendered HTML.

**One place for Vite configuration.** The plugin ran Vite rooted at `.11ty-vite/` and
never loaded `vite.config.ts`, so `envDir`, `optimizeDeps`, `server.allowedHosts`,
`define` and the whole `oxc`/decorator block were duplicated into `eleventy.config.js`
— including the decorator config behind the 2026-07-10 site-wide outage. There is now
one file. Dev keeps Vite as middleware inside the Eleventy dev server, which is the
one part of the plugin worth keeping.

**`build.sourcemap` became live.** It was `true` while nothing loaded `vite.config.ts`,
so no sourcemaps ever shipped. Set to `false` to preserve that; flip it locally to
debug a production chunk.

**Asset tags move with their templates.** The plugin hoisted every module script into
`<head>`; tags now render where the template puts them. Module scripts are deferred, so
execution order is unchanged, and shared chunks may be preloaded twice — harmless, as
the browser keys modules by URL.

**What this does NOT do.** It does not gate the Vite step on `src/` changing, so
`data/publish-notes.sh` still runs a full `npm run build`. That gate is now worth ~1.5s
of a 6.6s build rather than the ~5s it would have been worth before this change, since
the cost was removed for everyone rather than skipped for one caller. Rendering only
the species pages a note touched (`beeatlas-4oa`) is the remaining lever, and below it
the floor is Eleventy startup and `_data` loading, not rendering.

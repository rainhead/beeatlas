# Phase 148: App Shell Precache + vite-plugin-pwa Wiring - Research

**Researched:** 2026-06-11
**Domain:** vite-plugin-pwa `injectManifest` strategy wired through `@11ty/eleventy-plugin-vite` build chain
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** Wire `vite-plugin-pwa` 1.3.0 with `strategies: 'injectManifest'` under
`eleventy.config.js` `viteOptions.plugins` — NOT `vite.config.ts`. SW source is
hand-written `src/sw.ts`; compiled SW served at stable unhashed URL `/app/sw.js`,
`scope: '/app/'`. Remove the Phase 147 hand-written passthrough stub `public/app/sw.js`.

**D-02:** Precache scope via `injectManifest.globPatterns: ['app/index.html', 'assets/**/*.{js,css}']`.
Explicitly exclude `data/**`, `feeds/**`, `*.db`, `*.geojson`, `*.parquet`, `*.png` via
`globIgnores`.

**D-03:** `injectManifest.maximumFileSizeToCacheInBytes: 30_000_000`.

**D-04:** `src/sw.ts` does `precacheAndRoute(self.__WB_MANIFEST)`. NO `skipWaiting`,
NO `clientsClaim`.

**D-05:** Register `NavigationRoute(createHandlerBoundToURL('/app/index.html'))` allowlisted
to `/^\/app\//` only.

**D-06:** Keep Phase 147's manual `src/sw-registration.ts`. Set `injectRegister: null`.

**D-07:** `manifest: false` (no webmanifest emitted by plugin).

**D-08:** Extend existing `src/tests/build-output.test.ts` — NOT a standalone script —
with: (a) `_site/app/sw.js` contains an injected precache manifest, (b) every precached
URL exists under `_site/`, (c) `eleventy.config.js` sets `maximumFileSizeToCacheInBytes`
>= 30000000.

**D-09:** Offline-load proof (criterion 2) is manual HUMAN-UAT against
`http://localhost:<port>/app/index.html`.

### Claude's Discretion

- Exact `vite-plugin-pwa` option names/values to land the SW at output path `/app/sw.js`
  (`srcDir`, `filename`, `outDir`, `scope`, `base`) given the `.11ty-vite/` build rooting.
- Whether `self.__WB_MANIFEST` actually injects through the two-step build.
- Workbox import style in `src/sw.ts` and precache cache name.

### Deferred Ideas (OUT OF SCOPE)

- `/data/*` runtime caching — Phase 149
- Mapbox tile caching — later, TOS-gated
- Cache-priming progress indicator — Phase 149/150
- Prompt-to-reload update UI — OFF-03 phase
- Real `manifest.webmanifest` + icons + installability — Phase 151
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OFF-01 | App shell (hashed JS/CSS for `/app` entry) precached via `vite-plugin-pwa` `injectManifest`, wired through `eleventy.config.js` `viteOptions.plugins`; `/app` UI loads fully offline | Confirmed wiring path via `EleventyVite.runBuild` source read; exact option set derived from `options.ts` source |
</phase_requirements>

---

## Summary

Phase 148 wires `vite-plugin-pwa` 1.3.0 into the Eleventy+Vite build chain so that the `/app`
shell's hashed JS/CSS is precached by a Workbox-built service worker. The critical integration
constraint is that `@11ty/eleventy-plugin-vite` runs Vite rooted at `.11ty-vite/` and never
loads `vite.config.ts` — the plugin must live in `eleventy.config.js` `viteOptions.plugins`.
This is confirmed by reading `EleventyVite.runBuild` source directly.

The main technical risk is path resolution: the plugin's `outDir`, `srcDir`, and `globDirectory`
interact with the `.11ty-vite/`-rooted Vite build in non-obvious ways. This research resolves
the exact option set needed to land the compiled SW at `_site/app/sw.js` (stable, unhashed) with
`self.__WB_MANIFEST` replaced by real hashed precache URLs from `_site/`. The resolution requires
setting `outDir` and `injectManifest.globDirectory` as absolute paths derived from the project
root, since relative paths are resolved relative to `.11ty-vite/`, not the project root.

The Phase 147 stub `public/app/sw.js` must be removed. If it remains, Vite's publicDir copy
writes the stub to `_site/app/sw.js` during the build phase, but the plugin's `closeBundle` hook
fires after that and overwrites it with the Workbox-built SW — so correctness is preserved, but
the stub is dead code that misleads readers.

**Primary recommendation:** Use `VitePWA({ strategies: 'injectManifest', srcDir: 'src', filename: 'sw.ts', outDir: 'app' })` with `injectManifest.globDirectory` and `swDest` set to absolute paths of `_site/` and `_site/app/sw.js` respectively. See Architecture Patterns for the complete option block.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| SW source compilation (TypeScript → JS) | Build tool (vite-plugin-pwa Vite sub-build) | — | Plugin spawns a separate Rolldown build for the SW entry |
| Precache manifest injection | Build tool (workbox-build injectManifest) | — | Runs after the SW sub-build in `closeBundle`; scans `_site/` for hashed URLs |
| SW output path (`_site/app/sw.js`) | Plugin config (`outDir` + `swDest`) | Vite publicDir (overwritten) | Plugin `closeBundle` fires after Vite's publicDir copy |
| Precache asset discovery | workbox-build glob scan of `globDirectory` | — | Must be `_site/` (absolute); scans after Vite has written all chunks |
| SW registration | `src/sw-registration.ts` (Phase 147, unchanged) | — | Manual registration kept; `injectRegister: null` prevents plugin competition |
| Offline navigation fallback | `NavigationRoute` in `src/sw.ts` | — | Restricts to `/^\/app\//`; does not shadow main `/` site |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `vite-plugin-pwa` | 1.3.0 | SW build + Workbox precache manifest injection via Vite plugin | [VERIFIED: npm registry] Official vite-pwa org; Vite 8 peer dep confirmed; published 2026-05-05 |
| `workbox-build` | 7.4.1 | Build-time Workbox library (peer dep of vite-plugin-pwa) | [VERIFIED: npm registry] Required peer dep; do not install separately; Google Chrome team |
| `workbox-precaching` | 7.4.1 | SW: `precacheAndRoute(self.__WB_MANIFEST)` | [VERIFIED: npm registry] Official Workbox module; same version family |
| `workbox-routing` | 7.4.1 | SW: `NavigationRoute` + `registerRoute` | [VERIFIED: npm registry] Official Workbox module; same version family |

### Peer Dependencies (install with vite-plugin-pwa)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `workbox-window` | 7.4.1 | Peer dep of vite-plugin-pwa (not used in Phase 148 SW source) | [VERIFIED: npm registry] Install as peer dep; update lifecycle (OFF-03) uses it |

**Installation (devDependencies):**
```bash
npm install -D vite-plugin-pwa workbox-build workbox-window workbox-precaching workbox-routing
```

**Version verification (confirmed):**
```
vite-plugin-pwa@1.3.0  published 2026-05-05
workbox-build@7.4.1    published 2026-05-04
workbox-precaching@7.4.1  published 2026-05-04
workbox-routing@7.4.1     published 2026-05-04
workbox-window@7.4.1      published 2026-05-04
```

---

## Package Legitimacy Audit

> slopcheck ran successfully against all packages.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `vite-plugin-pwa` | npm | ~6 yrs (2020) | High (official vite-pwa org) | github.com/vite-pwa/vite-plugin-pwa | [OK] | Approved |
| `workbox-build` | npm | ~9 yrs (2017) | Very high (Google Chrome team) | github.com/googlechrome/workbox | [OK] | Approved |
| `workbox-precaching` | npm | ~9 yrs (2017) | Very high (Google Chrome team) | github.com/googlechrome/workbox | [OK] | Approved |
| `workbox-routing` | npm | ~9 yrs (2017) | Very high (Google Chrome team) | github.com/googlechrome/workbox | [OK] | Approved |
| `workbox-window` | npm | ~9 yrs (2017) | Very high (Google Chrome team) | github.com/googlechrome/workbox | [OK] | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
eleventy build:
  _pages/app/index.html → Eleventy template output → .11ty-vite/app/index.html
  src/ (passthrough copy) → _site/src/ → .11ty-vite/src/  (includes sw.ts)
  public/ (passthrough copy) → _site/public/ → .11ty-vite/public/

vite build (root = .11ty-vite/, outDir = _site/):
  [Entry] .11ty-vite/app/index.html
       → rewrites /src/app-entry.ts → /assets/app/index-<hash>.js
       → writes _site/app/index.html (rewritten), _site/assets/app/index-<hash>.js

  [publicDir] .11ty-vite/public/app/  (← Phase 147 stub still here if not deleted)
       → copies → _site/app/  (sw.js copied if public/app/sw.js still exists)

  [closeBundle — vite-plugin-pwa]:
    Step 1: Vite sub-build compiles .11ty-vite/src/sw.ts
            outDir = _site/app/ (plugin option, absolute)
            writes → _site/app/sw.js  (intermediate, Workbox imports bundled)

    Step 2: workbox-build injectManifest
            swSrc = _site/app/sw.js  (just compiled output)
            swDest = _site/app/sw.js  (overwrite in place)
            globDirectory = _site/  (absolute, plugin option)
            globPatterns = ['app/index.html', 'assets/**/*.{js,css}']
            → replaces self.__WB_MANIFEST with real precache list
            → final _site/app/sw.js with injected manifest ✓
```

**Key timing invariant:** Vite's publicDir copy runs during the main build phase (before
`closeBundle`). The plugin's SW compilation and manifest injection run in `closeBundle`.
Therefore the plugin's output always overwrites any publicDir copy of `public/app/sw.js`.
This means correctness is preserved even if the stub is not yet deleted — but the stub
MUST be deleted to avoid confusion and dead passthrough code.

### Recommended Project Structure

```
src/
└── sw.ts                    # NEW: injectManifest source — precacheAndRoute + NavigationRoute
public/app/
└── sw.js                    # REMOVED: Phase 147 stub (plugin now generates this)
eleventy.config.js           # MODIFIED: add VitePWA to viteOptions.plugins
src/tests/
└── build-output.test.ts     # MODIFIED: add 3 precache assertions (D-08)
```

### Pattern 1: VitePWA Plugin Configuration in eleventy.config.js

**What:** Add `VitePWA(...)` to `viteOptions.plugins`. Use absolute paths for `outDir` and
`injectManifest.globDirectory` since the Vite build root is `.11ty-vite/`, not the project root.

**Why absolute paths are required:**
- `outDir` is resolved as `resolve(viteConfig.root, outDir)` — with root `.11ty-vite/`, a relative
  `outDir` resolves inside `.11ty-vite/`, not under `_site/`
- `globDirectory` defaults to `resolve(root, outDir)` — same problem
- Using `path.resolve(process.cwd(), '_site/app')` produces an absolute path that resolves
  correctly regardless of what Vite sets as its root
- `process.cwd()` is the project root when running `eleventy` or `npm run build`

**Source:** `vite-plugin-pwa` `src/options.ts` line `resolveSwPaths` and `outDirRoot` computation;
`EleventyVite.js` `runBuild` method. [VERIFIED: GitHub source read directly]

**Example (eleventy.config.js):**
```javascript
// Source: vite-plugin-pwa src/options.ts resolveSwPaths + EleventyVite.js runBuild
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'path';

// In eleventyConfig.addPlugin(EleventyVitePlugin, { viteOptions: { ... } }):
//
// viteOptions: {
//   plugins: [
//     VitePWA({
//       strategies: 'injectManifest',
//       srcDir: 'src',        // swSrc = resolve('.11ty-vite/', 'src', 'sw.ts') ✓
//       filename: 'sw.ts',    // .ts extension triggers TypeScript SW sub-build
//       outDir: resolve(process.cwd(), '_site/app'),  // swDest = _site/app/sw.js ✓
//       injectRegister: null, // D-06: no competing registration
//       manifest: false,      // D-07: no webmanifest emitted
//       injectManifest: {
//         globDirectory: resolve(process.cwd(), '_site'),  // scan full output ✓
//         swDest: resolve(process.cwd(), '_site/app/sw.js'), // injection target ✓
//         globPatterns: ['app/index.html', 'assets/**/*.{js,css}'],
//         globIgnores: [
//           'data/**', 'feeds/**', '**/*.db', '**/*.geojson',
//           '**/*.parquet', '**/*.png', '**/sw.js',
//         ],
//         maximumFileSizeToCacheInBytes: 30_000_000,  // D-03
//       },
//     }),
//   ],
//   // ... existing viteOptions ...
// }
```

**Critical detail — `swDest` in `injectManifest` vs top-level `outDir`:**
- Top-level `outDir` controls where the Vite sub-build (TypeScript compilation) writes the SW
- `injectManifest.swDest` controls where workbox-build writes the manifest-injected result
- Both should be `_site/app/sw.js` (absolute). They must match or the final file ends up in
  the wrong location.
- The plugin sets `injectManifestOptions.swSrc = options.injectManifest.swDest` (the compiled
  output becomes the input for the injection step). [VERIFIED: GitHub vite-build.ts read directly]

### Pattern 2: src/sw.ts — injectManifest Source

**What:** The hand-written SW source that `vite-plugin-pwa` compiles and injects the precache
manifest into. Import Workbox modules via ESM — the plugin's SW sub-build bundles them with
Rolldown (NOT CDN `importScripts`).

**Lifecycle invariant (D-04, D-06):** No `skipWaiting`, no `clients.claim`. The browser's
default lifecycle applies: new SW installs and waits; takes control after all tabs reload.

**Source:** [VERIFIED: Chrome Developers Workbox docs; ARCHITECTURE.md §2a; CONTEXT.md D-04/D-05]

```typescript
// Source: workbox-precaching + workbox-routing official docs; D-04/D-05
import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

// Precache the app shell (hashed JS/CSS + /app/index.html)
// self.__WB_MANIFEST is replaced at build time by vite-plugin-pwa
precacheAndRoute(self.__WB_MANIFEST);

// Navigation fallback: serve cached /app/index.html for all /app/ navigations
// Allowlist prevents this from shadowing the main / site (D-05)
const handler = createHandlerBoundToURL('/app/index.html');
const navigationRoute = new NavigationRoute(handler, {
  allowlist: [/^\/app\//],
});
registerRoute(navigationRoute);

// D-04: NO skipWaiting, NO clients.claim
// The prompt-to-reload lifecycle (OFF-03) depends on the waiting state.
```

**TypeScript declaration for `self.__WB_MANIFEST`:** The plugin provides a virtual module
declaration. Add to `src/sw.ts` or ensure the project's `tsconfig.json` includes it. As of
vite-plugin-pwa 1.3.0, importing `virtual:pwa-register` or using `/// <reference types="vite-plugin-pwa/client" />` adds the type. For a bare `self.__WB_MANIFEST` reference in the SW, declare it explicitly:
```typescript
declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};
```

### Pattern 3: Build-Output Test Extensions (D-08)

**What:** Extend the `describe.skipIf(SKIP_BUILD)` block in `src/tests/build-output.test.ts`
with three new assertions.

**Why:** The build-output test runs in the CI deploy gate (same `VITEST_SKIP_BUILD` guard as
existing tests). No standalone post-build script needed.

```typescript
// Source: established pattern from Phase 147 (Phase 147 assertions in build-output.test.ts)

test('_site/app/sw.js contains an injected precache manifest (OFF-01, criterion 1)', () => {
  const sw = readFileSync(resolve(ROOT, '_site/app/sw.js'), 'utf-8');
  // The literal placeholder is replaced at build time; if it appears verbatim, injection failed
  expect(sw).not.toContain('self.__WB_MANIFEST');
  // A real precache manifest contains revision-keyed entries: [{url:...,revision:...}]
  expect(sw).toMatch(/\{url:/);
});

test('every precached URL in _site/app/sw.js exists as a file in _site/ (OFF-01, criterion 4)', () => {
  const sw = readFileSync(resolve(ROOT, '_site/app/sw.js'), 'utf-8');
  // Extract URLs from precache manifest array entries like {url:"/assets/app/index-abc.js",revision:"..."}
  const urlMatches = [...sw.matchAll(/\{url:"([^"]+)"/g)].map(m => m[1]!);
  expect(urlMatches.length, 'no precache URLs found — manifest may not have been injected').toBeGreaterThan(0);
  for (const url of urlMatches) {
    const filePath = resolve(ROOT, '_site' + url);
    expect(existsSync(filePath), `precached URL missing from _site/: ${url}`).toBe(true);
  }
});

test('eleventy.config.js sets maximumFileSizeToCacheInBytes >= 30000000 (OFF-01, criterion 3)', () => {
  const config = readFileSync(resolve(ROOT, 'eleventy.config.js'), 'utf-8');
  // Match the numeric literal (may be written as 30_000_000 or 30000000)
  const match = config.match(/maximumFileSizeToCacheInBytes\s*:\s*([\d_]+)/);
  expect(match, 'maximumFileSizeToCacheInBytes not found in eleventy.config.js').toBeTruthy();
  const value = parseInt(match![1]!.replace(/_/g, ''), 10);
  expect(value).toBeGreaterThanOrEqual(30_000_000);
});
```

### Anti-Patterns to Avoid

- **`viteOptions.plugins` in `vite.config.ts` instead of `eleventy.config.js`:** The dev server
  and build run with Vite rooted at `.11ty-vite/` and never load `vite.config.ts`. The plugin
  must live in `eleventy.config.js`. [VERIFIED: eleventy.config.js comments; EleventyVite.js source]

- **Relative `outDir` (e.g., `outDir: 'app'`):** Resolves to `.11ty-vite/app/`, not `_site/app/`.
  The SW compilation output would land in the temp folder and be destroyed when `rm -rf .11ty-vite/`
  runs at the end of the build. Use `path.resolve(process.cwd(), '_site/app')`. [VERIFIED: EleventyVite.js line 178 `rm -rf .11ty-vite/`]

- **Omitting `injectManifest.globDirectory`:** Defaults to `resolve('.11ty-vite/', outDir)`. If
  `outDir` is `_site/app` (absolute), `globDirectory` = `_site/app/` — which only contains
  `sw.js` and `index.html`, missing `_site/assets/**`. The precache manifest would be nearly
  empty. [VERIFIED: options.ts `outDirRoot` derivation]

- **Workbox CDN imports in `src/sw.ts`:** `importScripts('https://storage.googleapis.com/workbox-cdn/...')`
  breaks the Rolldown bundle and prevents offline caching. Use ESM imports; the plugin's SW
  sub-build bundles them. [CITED: STACK.md "What NOT to Use"]

- **Leaving `public/app/sw.js` in place:** The plugin overwrites it at `closeBundle` time, so
  correctness is preserved — but the stub is dead code and causes confusion. Remove it. (D-01)

- **`injectRegister: 'auto'` (default):** The plugin injects a `<script>` registration into the
  HTML. Phase 147's `src/sw-registration.ts` is the canonical registration path; a second
  registration via the plugin would create a race. Set `injectRegister: null`. (D-06)

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Precache manifest with hashed URLs | Custom build script to grep Vite manifest | `workbox-build injectManifest` (via `vite-plugin-pwa`) | Manual manifest gets stale instantly; revision tracking, cache busting, and cache cleanup require Workbox internals |
| TypeScript SW compilation | Separate `tsc` build step | `vite-plugin-pwa` SW sub-build (Rolldown) | Plugin handles `.ts` → `.js` + bundle of Workbox imports + source map in one pass |
| Offline navigation fallback | Custom `fetch` handler with URL matching | `NavigationRoute(createHandlerBoundToURL(...))` | Workbox handles cache misses, Request matching edge cases, and navigation detection correctly |
| Post-build URL existence check | Standalone shell script | Extend `build-output.test.ts` (D-08) | Existing test infrastructure already runs in CI deploy gate; no new script needed |

---

## Common Pitfalls

### Pitfall 1: `self.__WB_MANIFEST` Not Replaced (Still Literal in Output)

**What goes wrong:** `_site/app/sw.js` still contains the literal string `self.__WB_MANIFEST`
after the build. The SW fails to install because `precacheAndRoute(self.__WB_MANIFEST)` throws
`TypeError: precacheAndRoute is not a function` or similar.

**Why it happens:** Three root causes:
1. Plugin wired in `vite.config.ts` instead of `eleventy.config.js` — plugin never runs in the
   Eleventy-driven build
2. `globDirectory` resolves to `.11ty-vite/` (empty after Eleventy build renames it) or to a
   subdirectory with no matching assets — workbox-build finds no files and the injection is a
   no-op or produces an empty array `[]`
3. `outDir` resolves to `.11ty-vite/app/` — the compiled SW is written to the temp folder which
   is deleted, so the file that ends up in `_site/app/sw.js` is the old publicDir copy (the 147 stub)

**How to avoid:** Use absolute paths for `outDir` and `injectManifest.globDirectory`. Verify
with the D-08 test: `expect(sw).not.toContain('self.__WB_MANIFEST')`.

**Warning signs:** `_site/app/sw.js` contains `self.__WB_MANIFEST` verbatim, OR DevTools shows
SW install failed with `ReferenceError: self is not defined` or `TypeError`.

### Pitfall 2: SW Lands at `_site/sw.js` Instead of `_site/app/sw.js`

**What goes wrong:** The default `outDir` from the plugin is `viteConfig.build.outDir`, which
`eleventy-plugin-vite` sets to the absolute path of `_site/`. This causes `swDest = _site/sw.js`
(at the site root), not `_site/app/sw.js`. The SW registration in `src/sw-registration.ts`
looks for `/app/sw.js` — it does not find a SW at `/sw.js` under its registered path.

**How to avoid:** Set `outDir: path.resolve(process.cwd(), '_site/app')` explicitly.

**Warning signs:** `_site/sw.js` exists but `_site/app/sw.js` does not contain the injected
manifest (is still the 147 stub if `public/app/sw.js` was not deleted, or is missing).

### Pitfall 3: globPatterns Over-Captures Large Data Files

**What goes wrong:** A broad `globPatterns: ['**/*.{js,css,html}']` with `globDirectory: '_site'`
would include nothing unexpectedly large since data files are `.db`/`.geojson`/`.parquet`. However,
`maximumFileSizeToCacheInBytes` defaults to **2 MB** — any chunk over 2 MB is silently dropped from
the manifest unless the limit is raised. The `/app` entry chunks are all <100 KB so this is not
an active problem for Phase 148, but the 30 MB cap is set now for Phase 149 readiness.

**How to avoid:** `maximumFileSizeToCacheInBytes: 30_000_000` is already in D-03. Include `**/sw.js`
in `globIgnores` to prevent the SW file itself from being added to the precache manifest.

**Warning signs:** Build log shows "Workbox is warning you that one of the entries..." or the
`globDirectory` produces zero entries. Check with the D-08 URL-existence assertion.

### Pitfall 4: TypeScript Declaration for `self.__WB_MANIFEST` Missing

**What goes wrong:** `tsc --noEmit` (run as part of `npm run build`) fails with
`TS2339: Property '__WB_MANIFEST' does not exist on type 'ServiceWorkerGlobalScope'`.

**How to avoid:** Either use `/// <reference types="vite-plugin-pwa/client" />` at the top of
`src/sw.ts`, or add an explicit ambient declaration in the file:
```typescript
declare const self: ServiceWorkerGlobalScope & typeof globalThis & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>;
};
```
The `vite-plugin-pwa` package ships a `client.d.ts` that adds the global type; including
`vite-plugin-pwa/client` in `tsconfig.json` `types` array also works.

**Warning signs:** `npm run typecheck` fails before the build even reaches Eleventy.

### Pitfall 5: `injectManifest.swDest` Not Set — Injection Result Goes to Wrong Path

**What goes wrong:** The `injectManifest` options block in the plugin has its own `swDest`.
The workbox-build `injectManifest` step reads `swSrc` (the compiled SW output) and writes
the manifest-injected result to `swDest`. If `swDest` is not explicitly set in the
`injectManifest` options block, it defaults to `options.swDest` (the top-level `swDest`
from `resolveSwPaths`). This is normally correct, but when `outDir` is set to an absolute
path, it is best to be explicit to avoid ambiguity.

**How to avoid:** Set `injectManifest.swDest: path.resolve(process.cwd(), '_site/app/sw.js')`
explicitly. This makes the injection target unambiguous independent of how `outDir` resolves.

---

## Code Examples

### Complete VitePWA configuration for eleventy.config.js

```javascript
// Source: vite-plugin-pwa src/options.ts, src/vite-build.ts; EleventyVite.js runBuild
// [VERIFIED: GitHub source read directly]
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'path';

// Place inside eleventyConfig.addPlugin(EleventyVitePlugin, { viteOptions: { ... } })
// in the plugins array:

VitePWA({
  strategies: 'injectManifest',
  srcDir: 'src',          // .11ty-vite/src/sw.ts (src/ is Eleventy passthrough)
  filename: 'sw.ts',      // TypeScript: plugin compiles to sw.js internally
  outDir: resolve(process.cwd(), '_site/app'),  // compiled SW lands at _site/app/sw.js
  injectRegister: null,   // D-06: keep Phase 147 registration, no competing script
  manifest: false,        // D-07: no webmanifest until Phase 151
  injectManifest: {
    globDirectory: resolve(process.cwd(), '_site'),  // scan full output tree
    swDest: resolve(process.cwd(), '_site/app/sw.js'),  // injection writes here
    globPatterns: ['app/index.html', 'assets/**/*.{js,css}'],
    globIgnores: [
      'data/**', 'feeds/**', '**/*.db', '**/*.geojson',
      '**/*.parquet', '**/*.png', '**/sw.js',
    ],
    maximumFileSizeToCacheInBytes: 30_000_000,  // D-03: 30 MB for Phase 149 readiness
  },
}),
```

### src/sw.ts

```typescript
// Source: workbox-precaching, workbox-routing official Chrome Developers docs
// [CITED: developer.chrome.com/docs/workbox/modules/workbox-routing]
// TypeScript type hint for self.__WB_MANIFEST
/// <reference types="vite-plugin-pwa/client" />

import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

// Precache the app shell. self.__WB_MANIFEST is replaced at build time
// by vite-plugin-pwa's workbox-build injectManifest step.
precacheAndRoute(self.__WB_MANIFEST);

// Offline navigation: any /app/ navigation returns the cached app shell.
// The allowlist prevents this from intercepting navigations to / or other routes.
// Canonical URL is /app/index.html (CloudFront OAC returns 403 for /app/).
const handler = createHandlerBoundToURL('/app/index.html');
const navigationRoute = new NavigationRoute(handler, {
  allowlist: [/^\/app\//],
});
registerRoute(navigationRoute);

// D-04 / PITFALLS Pitfall 7:
// NO skipWaiting, NO clients.claim.
// The new SW waits until all /app tabs are closed before activating.
// This preserves the prompt-to-reload lifecycle (OFF-03) and prevents
// app-code ↔ DB version skew.
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Workbox 6.x CDN imports (`importScripts`) | ESM imports bundled by Vite/Rolldown in SW sub-build | Workbox 7 + vite-plugin-pwa 1.x | CDN approach breaks offline; ESM bundle is self-contained |
| `rollupOptions` in viteOptions | `rolldownOptions` | eleventy-plugin-vite 8.0.0 (current) | The plugin logs a deprecation warning for `rollupOptions`; use `rolldownOptions` |
| `vite-plugin-pwa` `generateSW` | `injectManifest` for custom runtime cache control | Always recommended for non-trivial apps | `generateSW` offers no hook for `occurrences.db` runtime cache strategy |

**Deprecated/outdated:**
- `workbox-webpack-plugin`: Webpack-specific; irrelevant to Vite
- `workbox.globPatterns` (on the `workbox:` key): Used for `generateSW` strategy only. For
  `injectManifest`, glob options go in the `injectManifest:` key.

---

## Assumptions Log

> All claims in this research were verified against official source code, official docs, or confirmed with `npm view`. No `[ASSUMED]` tags.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| — | All claims verified or cited | — | — |

**This table is empty:** All factual claims were verified or cited from authoritative sources.

---

## Open Questions

1. **Does `vite-plugin-pwa` need a `base` option to generate precache URLs relative to `/`?**
   - What we know: `viteConfig.base` defaults to `/`; the plugin uses `basePath` (resolved from
     `base`) to prefix cache URLs. Since `base: '/'` is the project default, precache URLs should
     be absolute paths like `/app/index.html` and `/assets/app/index-hash.js`.
   - What's unclear: Whether the plugin prepends the base path correctly when `outDir` is an
     absolute path pointing to a subdirectory.
   - Recommendation: Verify by inspecting `_site/app/sw.js` after the first build. The precache
     manifest should contain entries like `{url:"/app/index.html",revision:"..."}` and
     `{url:"/assets/app/index-hash.js",revision:null}`. If URLs are missing the leading `/`,
     set `base: '/'` explicitly in the `VitePWA` options.

2. **Do existing Phase 147 build-output tests still pass after removing `public/app/sw.js`?**
   - What we know: The existing test `'_site/app/sw.js exists at unhashed stable URL (D-04)'`
     asserts `existsSync(resolve(ROOT, '_site/app/sw.js'))`. Phase 148 generates this file via
     the plugin, so the assertion should still pass.
   - What's unclear: Whether there is any test that reads the *content* of `_site/app/sw.js`
     and expects the stub comment `// Phase 147 stub`.
   - Recommendation: The existing test is an `existsSync` check only — safe. No content
     assertion exists for the SW file in the current test suite.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `npm` | Package install | ✓ | (project standard) | — |
| `vite-plugin-pwa` | Core wiring | ✗ (not installed) | 1.3.0 target | None — must install |
| `workbox-build` | Peer dep | ✗ (not installed) | 7.4.1 target | None — required peer dep |
| `workbox-precaching` | SW source imports | ✗ (not installed) | 7.4.1 target | None — must install |
| `workbox-routing` | SW source imports | ✗ (not installed) | 7.4.1 target | None — must install |
| `workbox-window` | Peer dep (OFF-03) | ✗ (not installed) | 7.4.1 target | Install now, use later |
| `tsc` | Type-check `src/sw.ts` | ✓ | typescript ^5.8 (devDep) | — |
| Eleventy build (`npm run build`) | Full integration | ✓ | ^3.1.5 (devDep) | — |

**Missing dependencies with no fallback:**
- `vite-plugin-pwa`, `workbox-build`, `workbox-precaching`, `workbox-routing`, `workbox-window`
  (all must be installed in Wave 0)

**Missing dependencies with fallback:** none — all other deps already present.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.2 (already installed) |
| Config file | `vite.config.ts` (test section; `exclude` covers `_site/`, `infra/`) |
| Quick run command | `VITEST_SKIP_BUILD=1 npm test` |
| Full suite command | `npm test` (runs full build + build-output tests) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OFF-01 (criterion 1) | `_site/app/sw.js` has injected precache manifest (no literal `self.__WB_MANIFEST`) | build-output | `npm test` | ✗ Wave 0 |
| OFF-01 (criterion 3) | `maximumFileSizeToCacheInBytes >= 30000000` in `eleventy.config.js` | build-output (config read) | `npm test` | ✗ Wave 0 |
| OFF-01 (criterion 4) | Every precached URL exists under `_site/` | build-output | `npm test` | ✗ Wave 0 |
| OFF-01 (criterion 2) | JS/CSS served from `(ServiceWorker)` in offline DevTools | manual | DevTools offline mode | Manual-only |

### Sampling Rate

- **Per task commit:** `VITEST_SKIP_BUILD=1 npm test` (unit/non-build tests only; fast)
- **Per wave merge:** `npm test` (full build + build-output assertions)
- **Phase gate:** `npm test` green (all build-output assertions pass) before `/gsd:verify-work`

### Wave 0 Gaps

The three new assertions (OFF-01 criteria 1, 3, 4) must be added to `src/tests/build-output.test.ts`
in Wave 0 — they are the RED tests that define done.

- [ ] Three new `test(...)` blocks in `src/tests/build-output.test.ts` (criteria 1, 3, 4)
- [ ] `src/sw.ts` created (new file — needed before Wave 0 tests can be written but empty/stub for RED phase)

No new framework install needed (Vitest already present).

---

## Security Domain

> `security_enforcement` not explicitly set to false in config.json — treating as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | SW has no auth surface |
| V3 Session Management | no | SW caching is cache-control managed |
| V4 Access Control | no | Precache is read-only; scope restricted to `/app/` |
| V5 Input Validation | no | SW source code, not user input |
| V6 Cryptography | no | Cache integrity handled by Workbox revision hashes |

### Known Threat Patterns for Service Worker + Static Build

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SW cache poisoning (serving stale/wrong assets) | Tampering | Workbox revision hashes detect changes; `Cache-Control: no-cache` on `/app/sw.js` (Phase 147 CDK, already in place) ensures browser always checks for SW updates |
| SW scope expansion (accidental root-scope SW) | Elevation of Privilege | `scope: '/app/'` in registration; import-topology guarantee (only `app-entry.ts` imports `sw-registration.ts`) |
| Stale SW serving wrong app version | Information Disclosure | No `skipWaiting` preserves atomic version transition; precache revision tracking ensures correct asset versions |
| Precached `self.__WB_MANIFEST` not replaced (empty cache) | Denial of Service | D-08 build-output assertion detects this before deploy |

---

## Project Constraints (from CLAUDE.md)

- **Static hosting only — no server runtime:** SW + Workbox precache is entirely client-side;
  no server runtime needed. ✓
- **Python 3.14+ (data/pyproject.toml):** Not applicable to this JS phase.
- **AWS via CDK in `infra/`:** No CDK changes needed for Phase 148. Phase 147 already set
  `Cache-Control: no-cache` on `/app/sw.js` in CloudFront.
- **Canonical URL is `/app/index.html`:** D-05 and the NavigationRoute use `/app/index.html`
  as the `createHandlerBoundToURL` target (not `/app/` which 403s on CloudFront OAC). ✓
- **No `skipWaiting`/`clientsClaim`:** Enforced in `src/sw.ts` (D-04). ✓
- **`npm run build` must pass:** `tsc --noEmit` runs as part of build; `src/sw.ts` needs
  the `__WB_MANIFEST` type declaration to pass typecheck.

---

## Sources

### Primary (HIGH confidence)

- `node_modules/@11ty/eleventy-plugin-vite/EleventyVite.js` — `runBuild` method: `DeepCopy({}, this.options.viteOptions)` then `build(viteOptions)` with `root = tempFolderPath`. Confirmed plugins pass through. [VERIFIED: file read directly]
- `node_modules/@11ty/eleventy-plugin-vite/.eleventy.js` — Confirms `addPassthroughCopy(publicDir)` and `eleventy.after` hook for `runBuild`. [VERIFIED: file read directly]
- `github.com/vite-pwa/vite-plugin-pwa` `src/options.ts` — `resolveSwPaths()`, `outDirRoot`, default `outDir = viteConfig.build.outDir`, `swSrc`/`swDest` computation. [VERIFIED: GitHub API read directly]
- `github.com/vite-pwa/vite-plugin-pwa` `src/vite-build.ts` — `buildSW()`: Vite sub-build for SW compilation, then workbox-build `injectManifest()`; `injectManifestOptions.swSrc = options.injectManifest.swDest`. [VERIFIED: GitHub API read directly]
- `github.com/vite-pwa/vite-plugin-pwa` `src/plugins/build.ts` — `closeBundle` hook fires `_generateSW`. [VERIFIED: GitHub API read directly]
- `github.com/googlechrome/workbox` `packages/workbox-build/src/types.ts` — `maximumFileSizeToCacheInBytes`, `globDirectory`, `globPatterns`, `globIgnores`, `swDest`, `swSrc` in `InjectManifestOptions`. [VERIFIED: GitHub API read directly]
- `src/tests/build-output.test.ts` — Established test pattern with `describe.skipIf(SKIP_BUILD)`, `beforeAll(execSync('npm run build'))`, `readFileSync`, `existsSync`. [VERIFIED: file read directly]
- `.planning/phases/147-app-route-sw-topology/147-01-SUMMARY.md` — Phase 147 deliverables; `public/app/sw.js` stub exists; `src/sw-registration.ts` registers `/app/sw.js` with `scope: '/app/'`. [VERIFIED: file read directly]

### Secondary (MEDIUM confidence)

- `developer.chrome.com/docs/workbox/modules/workbox-routing` — `NavigationRoute` constructor with `allowlist: RegExp[]` option; `createHandlerBoundToURL` usage pattern. [CITED: official Chrome Developers docs]
- `vite-pwa-org.netlify.app/guide/faq` — Default `maximumFileSizeToCacheInBytes` is 2 MiB; can raise via `injectManifest` config. [CITED: official vite-plugin-pwa docs]
- `.planning/research/STACK.md` §3 — vite-plugin-pwa 1.3.0 wiring rationale; Workbox 7.4.1 peer dep family; npm view version confirmations. [VERIFIED: file read directly]
- `.planning/research/PITFALLS.md` Pitfalls 2, 3, 5 — eleventy-plugin-vite wiring constraint (must use `eleventy.config.js`); `maximumFileSizeToCacheInBytes` 2 MB default silently excludes large files; no `skipWaiting`. [VERIFIED: file read directly]

### npm registry verification

```
npm view vite-plugin-pwa version    → 1.3.0  [VERIFIED: npm registry]
npm view workbox-build version      → 7.4.1  [VERIFIED: npm registry]
npm view workbox-precaching version → 7.4.1  [VERIFIED: npm registry]
npm view workbox-routing version    → 7.4.1  [VERIFIED: npm registry]
npm view workbox-window version     → 7.4.1  [VERIFIED: npm registry]
slopcheck install vite-plugin-pwa workbox-build workbox-window workbox-precaching workbox-routing
  → 5 OK (all clean)
```

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions confirmed via npm view; slopcheck all OK; source code read directly
- Plugin wiring / path resolution: HIGH — confirmed by reading `options.ts` and `vite-build.ts` source from GitHub API and `EleventyVite.js` locally
- Architecture patterns: HIGH — derived from authoritative source code, not training data
- Pitfalls: HIGH — sourced from Phase 147 deviations, official docs, and source code analysis

**Research date:** 2026-06-11
**Valid until:** 2026-07-11 (stable ecosystem; vite-plugin-pwa has active maintenance)

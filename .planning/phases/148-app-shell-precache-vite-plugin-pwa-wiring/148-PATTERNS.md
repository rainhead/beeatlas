# Phase 148: App Shell Precache + vite-plugin-pwa Wiring - Pattern Map

**Mapped:** 2026-06-11
**Files analyzed:** 4 (1 new, 2 modified, 1 removed)
**Analogs found:** 4 / 4

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `eleventy.config.js` | config | build-pipeline | `eleventy.config.js` itself (lines 48–92) | exact — add `plugins` array to existing `viteOptions` block |
| `src/sw.ts` | service-worker | event-driven | `public/app/sw.js` (Phase 147 stub) + `src/sw-registration.ts` | role-match — same SW lifecycle conventions, different implementation |
| `src/tests/build-output.test.ts` | test | request-response (file I/O) | `src/tests/build-output.test.ts` itself (lines 305–323) | exact — extend Phase 147 `describe.skipIf(SKIP_BUILD)` block |
| `public/app/sw.js` | — | — | — | REMOVE — no analog needed |

---

## Pattern Assignments

### `eleventy.config.js` (config, build-pipeline)

**Analog:** `eleventy.config.js` (same file — add `plugins` array inside the existing `viteOptions` block)

**Insertion point** (lines 48–92 — the `addPlugin` call):

The `viteOptions` object currently ends at the `server` key (line 83) before the closing brace on line 91. The `plugins` array is added as a new key at the same level as `appType`, `envDir`, `optimizeDeps`, and `server`. Import `VitePWA` and `resolve` at the top of the file alongside the existing `EleventyVitePlugin` import.

**Existing imports block** (lines 10–11):
```javascript
import EleventyVitePlugin from "@11ty/eleventy-plugin-vite";
import { quantify } from "./src/lib/quantify.js";
```
Add after line 11:
```javascript
import { VitePWA } from "vite-plugin-pwa";
import { resolve } from "path";
```

**Existing `viteOptions` block structure** (lines 48–92 — the full `addPlugin` call for reference):
```javascript
eleventyConfig.addPlugin(EleventyVitePlugin, {
  viteOptions: {
    appType: "mpa",
    envDir: process.cwd(),
    optimizeDeps: {
      exclude: ["wa-sqlite"],
    },
    server: {
      allowedHosts: ["maderas.amandrai.net"],
    },
    // publicDir comment block ends here — closing brace on next line
  },
});
```

**Plugin insertion — add `plugins` key** to `viteOptions` after the `server` key:
```javascript
plugins: [
  VitePWA({
    strategies: 'injectManifest',
    srcDir: 'src',         // resolves to .11ty-vite/src/sw.ts (src/ is Eleventy passthrough)
    filename: 'sw.ts',     // .ts extension triggers TypeScript SW sub-build
    outDir: resolve(process.cwd(), '_site/app'),  // compiled SW lands at _site/app/sw.js
    injectRegister: null,  // D-06: keep Phase 147 registration; no competing <script>
    manifest: false,       // D-07: no webmanifest until Phase 151
    injectManifest: {
      globDirectory: resolve(process.cwd(), '_site'),  // scan full output tree
      swDest: resolve(process.cwd(), '_site/app/sw.js'),  // injection writes here
      globPatterns: ['app/index.html', 'assets/**/*.{js,css}'],
      globIgnores: [
        'data/**', 'feeds/**', '**/*.db', '**/*.geojson',
        '**/*.parquet', '**/*.png', '**/sw.js',
      ],
      maximumFileSizeToCacheInBytes: 30_000_000,  // D-03: 30 MB cap
    },
  }),
],
```

**Critical convention from existing codebase:** `eleventy.config.js` uses extensive inline comments to document WHY each option exists. Follow this pattern — add a comment block above the `plugins` key explaining the vite-plugin-pwa placement rationale (mirroring the `server.*` comment on lines 74–82, which explains the same `.11ty-vite/` rooting constraint).

**Absolute-path invariant (from RESEARCH.md anti-patterns):** `outDir` and `injectManifest.globDirectory` MUST be `resolve(process.cwd(), ...)` absolute paths. A relative `outDir: 'app'` resolves to `.11ty-vite/app/` which is destroyed after the build (`EleventyVite.js` line 178: `rm -rf .11ty-vite/`). The existing codebase already uses `process.cwd()` in `envDir: process.cwd()` (line 70) — this is the established pattern for project-root-relative paths in this file.

---

### `src/sw.ts` (service-worker, event-driven)

**Analog 1:** `public/app/sw.js` (Phase 147 stub, lines 1–22) — same lifecycle invariants (no `skipWaiting`, no `clientsClaim`), same comment style. The stub is the behavioral predecessor; `src/sw.ts` replaces it with Workbox-powered precaching.

**Analog 2:** `src/sw-registration.ts` (lines 1–22) — establishes the SW comment header style ("Imported ONLY by…", structural guarantees), `scope: '/app/'` canonical value.

**Lifecycle invariants from analog** (`public/app/sw.js` lines 1–21):
```javascript
// Phase 147 stub — pass-through only, no caching.
// D-06: No lifecycle-skip calls or immediate client takeover (preserves the
// prompt-to-reload invariant). Both are excluded — this is non-negotiable.

self.addEventListener('install', (event) => {
  // New SW waits until old tabs close before taking control (D-06).
  event.waitUntil(Promise.resolve());
});

self.addEventListener('activate', (event) => {
  // Bare activate listener per D-06: no immediate takeover of already-open
  // /app tabs. Controlled after the next reload. Logging here is fine.
});
```

**Core pattern for `src/sw.ts`** (Workbox imports + precache + navigation route per D-04/D-05):
```typescript
/// <reference types="vite-plugin-pwa/client" />

import { precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

// self.__WB_MANIFEST is replaced at build time by vite-plugin-pwa
precacheAndRoute(self.__WB_MANIFEST);

// Offline navigation: /app/ navigations return the cached app shell.
// Allowlist prevents shadowing the main / site (D-05).
// Canonical URL is /app/index.html — CloudFront OAC 403s /app/ (no trailing-slash rewrite).
const handler = createHandlerBoundToURL('/app/index.html');
const navigationRoute = new NavigationRoute(handler, {
  allowlist: [/^\/app\//],
});
registerRoute(navigationRoute);

// D-04: NO skipWaiting, NO clients.claim.
// Preserves prompt-to-reload lifecycle (OFF-03) and app-code↔DB version safety.
```

**TypeScript concern:** `tsconfig.json` `types` array (line 3) contains `["vite/client", "node"]` — `vite-plugin-pwa/client` is NOT listed. The `/// <reference types="vite-plugin-pwa/client" />` triple-slash directive in `src/sw.ts` itself is the correct pattern (avoids polluting `tsconfig.json` for a single file). This resolves `self.__WB_MANIFEST` typing without modifying `tsconfig.json`.

**Note on `lib` in tsconfig.json:** The project's `tsconfig.json` includes `"DOM"` in `lib` (line 6), which provides `ServiceWorkerGlobalScope`. The `vite-plugin-pwa/client` reference adds the `__WB_MANIFEST` property to that type.

---

### `src/tests/build-output.test.ts` (test, file-I/O)

**Analog:** `src/tests/build-output.test.ts` lines 305–323 — the Phase 147 `/app` route assertions added in the same describe block. These are the direct predecessor assertions to copy style from.

**Established assertion style** (lines 305–323 — Phase 147 pattern to copy):
```typescript
// Phase 147 — /app route build output (ROUTE-01)

test('emits _site/app/index.html (ROUTE-01)', () => {
  expect(existsSync(resolve(ROOT, '_site/app/index.html'))).toBe(true);
});

test('_site/app/index.html references a hashed app entry chunk (ROUTE-01)', () => {
  const html = readFileSync(resolve(ROOT, '_site/app/index.html'), 'utf-8');
  expect(html).toMatch(/src="\/assets\/app\/index-[^"]+\.js"/);
});

test('_site/app/sw.js exists at unhashed stable URL (D-04)', () => {
  expect(existsSync(resolve(ROOT, '_site/app/sw.js'))).toBe(true);
});
```

**Key conventions to match:**
- Phase comment header before the new group: `// Phase 148 — ...`
- Decision references in test names: `(OFF-01, criterion N)` (see existing pattern `(D-04)`, `(ROUTE-01)`)
- `readFileSync(resolve(ROOT, '_site/...'), 'utf-8')` for content reads
- `existsSync(resolve(ROOT, '_site/...'))` for existence checks
- `ROOT` is already defined at line 13: `const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')`
- All imports already present: `readFileSync`, `existsSync` from `node:fs`; `resolve` from `node:path`

**Three new assertions to add** (D-08, OFF-01 criteria 1, 3, 4):

```typescript
// Phase 148 — precache manifest verification (OFF-01)

test('_site/app/sw.js contains an injected precache manifest (OFF-01, criterion 1)', () => {
  const sw = readFileSync(resolve(ROOT, '_site/app/sw.js'), 'utf-8');
  // If self.__WB_MANIFEST appears verbatim, injection failed
  expect(sw).not.toContain('self.__WB_MANIFEST');
  // A real precache manifest contains revision-keyed entries: {url:...,revision:...}
  expect(sw).toMatch(/\{url:/);
});

test('every precached URL in _site/app/sw.js exists as a file in _site/ (OFF-01, criterion 4)', () => {
  const sw = readFileSync(resolve(ROOT, '_site/app/sw.js'), 'utf-8');
  const urlMatches = [...sw.matchAll(/\{url:"([^"]+)"/g)].map(m => m[1]!);
  expect(urlMatches.length, 'no precache URLs found — manifest may not have been injected').toBeGreaterThan(0);
  for (const url of urlMatches) {
    const filePath = resolve(ROOT, '_site' + url);
    expect(existsSync(filePath), `precached URL missing from _site/: ${url}`).toBe(true);
  }
});

test('eleventy.config.js sets maximumFileSizeToCacheInBytes >= 30000000 (OFF-01, criterion 3)', () => {
  const config = readFileSync(resolve(ROOT, 'eleventy.config.js'), 'utf-8');
  const match = config.match(/maximumFileSizeToCacheInBytes\s*:\s*([\d_]+)/);
  expect(match, 'maximumFileSizeToCacheInBytes not found in eleventy.config.js').toBeTruthy();
  const value = parseInt(match![1]!.replace(/_/g, ''), 10);
  expect(value).toBeGreaterThanOrEqual(30_000_000);
});
```

**Insertion point:** Add the Phase 148 group immediately after the existing Phase 147 group (after line 323, before the closing `});` of `describe.skipIf(SKIP_BUILD)`).

**Style note on `parseInt` with `noUncheckedIndexedAccess`:** The `tsconfig.json` has `"noUncheckedIndexedAccess": true` (line 26). The `match![1]!` non-null assertions on the regex match groups are load-bearing — without them `tsc --noEmit` fails. This pattern is confirmed by the existing test at line 86: `speciesFile?.split('_site')[1]`.

---

### `public/app/sw.js` (REMOVE)

No pattern needed — this file is deleted. The Phase 147 lifecycle conventions it carried (no `skipWaiting`, no `clientsClaim`) are carried forward into `src/sw.ts` via the D-04 invariant.

---

## Shared Patterns

### `process.cwd()` for project-root paths in `eleventy.config.js`
**Source:** `eleventy.config.js` line 70 (`envDir: process.cwd()`)
**Apply to:** The new `VitePWA` plugin options (`outDir`, `injectManifest.globDirectory`, `injectManifest.swDest`)

The existing `envDir: process.cwd()` establishes that `process.cwd()` is the correct idiom for project-root-relative paths in `viteOptions`, because Vite runs rooted at `.11ty-vite/` and relative paths would resolve there instead. All three absolute path options in `VitePWA` must use `resolve(process.cwd(), ...)`.

### `describe.skipIf(SKIP_BUILD)` + `beforeAll(execSync('npm run build'))` guard
**Source:** `src/tests/build-output.test.ts` lines 16–19
**Apply to:** New Phase 148 assertions — they join the existing block, inheriting the guard automatically. No new `describe` wrapper needed.

```typescript
const SKIP_BUILD = process.env.VITEST_SKIP_BUILD === '1';

describe.skipIf(SKIP_BUILD)('build output (PAGE-07, PAGE-09)', () => {
  beforeAll(() => {
    execSync('npm run build', { cwd: ROOT, stdio: 'pipe' });
  }, 180_000);
  // ... all tests share this one beforeAll build
```

### Inline documentation comment style in `eleventy.config.js`
**Source:** `eleventy.config.js` lines 55–83 (the `server.*` explanation block)
**Apply to:** New `plugins` key in `viteOptions`

Every non-obvious option in `eleventy.config.js` has a comment explaining why it's there and why it can't live in `vite.config.ts`. The `plugins` block needs the same treatment — specifically explaining that `vite-plugin-pwa` must be wired here (not `vite.config.ts`) for the same `.11ty-vite/` rooting reason documented in the `server.*` comment.

---

## No Analog Found

No files in this phase lack a codebase analog. All patterns are fully grounded in existing source files.

---

## Metadata

**Analog search scope:** `eleventy.config.js`, `src/sw-registration.ts`, `public/app/sw.js`, `src/tests/build-output.test.ts`, `tsconfig.json`, `src/` directory listing
**Files read:** 6
**Pattern extraction date:** 2026-06-11

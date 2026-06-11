# Phase 147: `/app` Route + SW Topology — Research

**Researched:** 2026-06-10
**Domain:** Eleventy+Vite page scaffolding, service worker topology, CDK CloudFront behaviors, CDK template assertions
**Confidence:** HIGH — all findings verified against actual source files in this repo or CDK/CloudFront CloudFormation output

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** `/app` renders the full existing `<bee-atlas>` SPA from this phase, via a new `_pages/app/index.html` mirroring `_pages/index.html`.
- **D-02:** New Vite entry `src/app-entry.ts`; `_pages/app/index.html` references `./src/app-entry.ts` (not `./src/bee-atlas.ts` directly).
- **D-03:** SW registration in `src/sw-registration.ts`, imported only by `src/app-entry.ts`; call `navigator.serviceWorker.register('/app/sw.js', { scope: '/app' })`.
- **D-04:** SW file at `public/app/sw.js` — Vite passthrough, unhashed, stable URL. No `Service-Worker-Allowed` header.
- **D-05:** `public/app/sw.js` is a minimal hand-written stub: `install`/`activate` listeners + pass-through `fetch` handler (`event.respondWith(fetch(event.request))`, no caching).
- **D-06:** No `skipWaiting`/`clientsClaim` in the stub — preserves OFF-03 prompt-to-reload invariant.
- **D-07:** `/app` unlisted via `eleventyExcludeFromCollections: true` front matter + no nav/home/sitemap link. No `noindex` meta.
- **D-08:** CloudFront behaviors for both `/app/sw.js` and `/app/manifest.webmanifest` added in this phase (manifest file itself comes in Phase 151 — behavior is harmless before the file exists).
- **D-09:** Shared `ResponseHeadersPolicy` setting `Cache-Control: no-cache, no-store, must-revalidate` (`customHeadersBehavior`, `override: true`) + zero-TTL `CachePolicy`, applied to both path behaviors; mirrors existing `/data/*` pattern.
- **D-10:** ROUTE-03 gated by a `cdk synth` template-assertion test (asserts no-cache behavior/headers on both paths) + post-deploy `curl -I` spot-check in HUMAN-UAT.
- **D-11:** ROUTE-02 verified via DevTools against a local production-build preview (`npm run build && npm run preview`) on `http://localhost`.
- **D-12:** Criterion 1 verified via local build check.

### Claude's Discretion

- Exact CDK construct IDs/naming for new policies and behaviors.
- Precise pass-through stub SW source and how `app-entry.ts` composes `<bee-atlas>` + registration.
- Test file placement/naming for the CDK assertion.

### Deferred Ideas (OUT OF SCOPE)

- App-shell precache + `vite-plugin-pwa` `injectManifest` wiring — Phase 148.
- `/data/` runtime caching — Phase 149.
- Real `manifest.webmanifest` content + icons + installability — Phase 151.
- Adding `noindex`/robots if the dogfood route ever needs hardening.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ROUTE-01 | Unlisted `/app/` route serves the offline-capable map+table; not linked from main site, sitemap, or nav; `/` unchanged and has no SW registered. | `eleventyExcludeFromCollections: true` front matter pattern confirmed in `_pages/scaffold-check.njk`; no sitemap plugin detected; `_pages/index.html` template pattern confirmed. |
| ROUTE-02 | SW at `/app/sw.js`, `scope: '/app'`, controls `/app` page and intercepts same-origin `/data/*` fetches; DevTools confirms no SW on `/`. | SW scope = page control (not fetch path filtering) confirmed in ARCHITECTURE.md §1. Pass-through fetch handler demonstrates intercept. No-SW on `/` enforced by import topology: `_pages/index.html` references `src/bee-atlas.ts` which never imports `sw-registration.ts`. |
| ROUTE-03 | `/app/sw.js` and `/app/manifest.webmanifest` served with `Cache-Control: no-cache` via CloudFront behavior. | CDK `addBehavior` + `ResponseHeadersPolicy` (`customHeadersBehavior`) + zero-TTL `CachePolicy` pattern confirmed working in `beeatlas-stack.ts`. CDK assertions lib available; template-assertion test pattern confirmed. |
</phase_requirements>

---

## Summary

Phase 147 is exclusively **topology**: four new files, one modified CDK stack, and a CDK assertion test. No new npm dependencies are required or installed. The build pipeline and SW mechanism are verified against the actual source tree.

The key architectural fact: SW `scope: '/app'` controls which *pages* the SW governs, not which *fetches* it intercepts. A SW at `/app/sw.js` with `scope: '/app'` fully intercepts all `/data/*` fetches issued by the `/app` page — no `Service-Worker-Allowed` header needed. This is confirmed in ARCHITECTURE.md §1 (cross-referenced to MDN) and is the decisive design choice that makes the whole topology work cleanly.

The Eleventy+Vite wiring has one non-obvious constraint: `_pages/app/index.html` must be authored as an Eleventy *template* (not a passthrough), because `eleventy-plugin-vite` skips its Vite build pass when `results.length === 0` (line 81 of the plugin). `_pages/index.html` confirms the exact template pattern to mirror.

The CDK no-cache behavior uses the `customHeadersBehavior` path of `ResponseHeadersPolicy` (not `corsBehavior`). This is structurally identical to what the `/data/*` CORS behavior uses — the same construct types, the same `addBehavior` call pattern — but targeting the `Cache-Control` header instead of CORS headers.

No test runner exists in `infra/` today. D-10 requires creating one. The standard CDK assertion pattern uses `aws-cdk-lib/assertions`'s `Template.fromStack()`, which is already available in `infra/node_modules`. The infra is CommonJS + `ts-node`; the test runner to add is jest + ts-jest (standard CDK testing pattern), or the test can be written as a `ts-node` script with `node:assert` and run via a new `npm run test` script in `infra/package.json`.

**Primary recommendation:** Create the four new files (listed below), add the two CDK behaviors, add a CDK assertion test as a `ts-node` script in `infra/test/` with `node:assert` (no new test framework dependency needed), and wire it into `infra/package.json`'s `test` script.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `/app` route rendering | Frontend (Eleventy template) | Vite bundler (entry point) | Eleventy templates the HTML; Vite bundles the JS/CSS entry |
| SW registration | Browser client (`src/sw-registration.ts`) | — | Import topology enforces no-SW-on-`/`; registration is client-side only |
| SW fetch interception | SW runtime (`public/app/sw.js`) | — | Pass-through handler; scope controls page attachment |
| CloudFront no-cache for SW/manifest | CDN (CloudFront behavior) | CDK (IaC definition) | Response header policy applied at edge |
| No-SW guarantee for `/` | Build (import topology) | — | `_pages/index.html` never imports `sw-registration.ts`; structural, not runtime |

---

## Standard Stack

No new packages are installed in this phase. All tools used are already in `package.json`.

### Core (existing — no installation)
| Tool | Version | Purpose |
|------|---------|---------|
| `@11ty/eleventy-plugin-vite` | `^8.0.0` (installed) | Eleventy→Vite MPA pipeline; `_pages/app/index.html` gets a Vite build pass |
| `vite` | `^8.0.16` (installed) | Bundles `src/app-entry.ts`; `public/` passthrough for `public/app/sw.js` |
| `aws-cdk-lib` | `^2.238.0` (installed in `infra/`) | CloudFront `addBehavior` + `ResponseHeadersPolicy` + `CachePolicy` |
| `aws-cdk-lib/assertions` | included in `aws-cdk-lib` | `Template.fromStack()` + `Match` for CDK template assertion test |
| `ts-node` | `^10.9.2` (installed in `infra/`) | Runs CDK assertion test as a script without a separate test runner |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `ts-node` script for CDK test | jest + ts-jest | jest/ts-jest is the CDK canonical test pattern and supports `describe`/`test`/`expect`; ts-node + `node:assert` works with zero new dependencies and is sufficient for 2-3 simple assertions |
| `customHeadersBehavior` (RHP) | Managed response headers policy | Custom header approach is the only path that sets `Cache-Control` response headers via CloudFront; managed policies don't include `Cache-Control` |

---

## Package Legitimacy Audit

No new packages are installed in Phase 147. This section is not applicable.

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
Browser loads http://localhost/app/ (prod preview) or https://beeatlas.net/app/
  │
  ├── CloudFront: /app/sw.js      → no-cache, no-store behavior (new)
  ├── CloudFront: /app/manifest.* → no-cache, no-store behavior (new)
  ├── CloudFront: /app/* (other)  → defaultBehavior (existing)
  │
  └── /app/index.html  ← Eleventy template output (new)
        ├── <script type="module" src="/assets/app-entry-<hash>.js">
        │     (Vite hashes this; Eleventy rewrites the src tag)
        │
        ├── src/app-entry.ts  (new Vite entry)
        │     ├── import '<bee-atlas>'    (from src/bee-atlas.ts — unchanged)
        │     └── import './sw-registration.ts'   (new)
        │           └── navigator.serviceWorker.register('/app/sw.js', { scope: '/app' })
        │
        └── /app/sw.js  (Vite passthrough from public/app/sw.js — not hashed)
              ├── addEventListener('install', e => e.waitUntil(self.skipWaiting()))
              │     NOTE: no skipWaiting per D-06 — only e.waitUntil(Promise.resolve())
              ├── addEventListener('activate', ...)
              └── addEventListener('fetch', e => e.respondWith(fetch(e.request)))
                    ↑ intercepts /data/* fetches from /app page (scope controls pages, not paths)

/ (main route) — UNTOUCHED
  └── _pages/index.html → <script src="./src/bee-atlas.ts">
        (never imports sw-registration.ts → no SW registered on /)
```

### Recommended Project Structure (new files only)

```
_pages/
└── app/
    └── index.html          # new Eleventy template; mirrors _pages/index.html

src/
├── app-entry.ts            # new Vite entry for /app; imports bee-atlas + sw-registration
└── sw-registration.ts      # new; registers /app/sw.js with scope: /app

public/
└── app/
    └── sw.js               # new hand-written stub SW; Vite passthrough (not hashed)

infra/
├── lib/
│   └── beeatlas-stack.ts   # modified: 2 new addBehavior calls + shared policies
└── test/
    └── beeatlas-stack.test.ts  # new CDK assertion test (ts-node + node:assert)
```

### Pattern 1: Eleventy SPA Template (existing — mirror exactly)

`_pages/index.html` is the template to mirror for `_pages/app/index.html`.

**What:** Plain HTML file with no front matter in `_pages/index.html` (the root SPA entry). It references CSS and a TypeScript module entry via relative paths from the page's directory. Eleventy renders it as a template, which makes `eleventy-plugin-vite` include it in `results` and run its Vite build pass.

**Critical constraint:** The file MUST be an Eleventy template (not a `addPassthroughCopy` target). If the SPA entry is a passthrough, `results.length === 0` in `eleventy-plugin-vite` line 81, and Vite never runs its build pass — the `<script type="module">` tag is NOT rewritten to point at hashed assets.

[VERIFIED: eleventy.config.js comment lines 22-28 and _pages/index.html direct read]

Exact template to mirror:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>BeeAtlas</title>
    <link rel="icon" href="data:,">
    <link rel="stylesheet" href="./src/index.css" />
    <script type="module" src="./src/app-entry.ts"></script>
  </head>
  <body>
    <bee-atlas></bee-atlas>
  </body>
</html>
```

Key differences from `_pages/index.html`:
- `<script>` references `./src/app-entry.ts` instead of `./src/bee-atlas.ts` (D-02)
- The Atom feed `<link>` from index.html is NOT needed in the app page
- `eleventyExcludeFromCollections: true` front matter IS needed (D-07)

**`_pages/app/index.html` therefore needs front matter to set `eleventyExcludeFromCollections: true`.** Eleventy front matter in plain HTML uses the `---` delimiter block:

```html
---
eleventyExcludeFromCollections: true
---
<!doctype html>
...
```

[VERIFIED: `_pages/scaffold-check.njk` confirms `eleventyExcludeFromCollections: true` front matter pattern works in this project]

### Pattern 2: `public/app/sw.js` Vite Passthrough

The two-step mechanism (confirmed in `eleventy.config.js` comment lines 35-46):

1. `eleventy-plugin-vite` auto-registers `addPassthroughCopy("public")` (plugin source `.eleventy.js` line 40), which copies `public/` to `.11ty-vite/public/`.
2. Vite's default `publicDir` handling copies `.11ty-vite/public/*` contents into `_site/` at site root — with **no hashing**.

Result: `public/app/sw.js` → `_site/app/sw.js` at a stable, unhashed URL. [VERIFIED: eleventy.config.js lines 35-46]

**The stub SW content (D-05, D-06):**

```javascript
// Phase 147 stub — pass-through only, no caching.
// No skipWaiting / clientsClaim (D-06: preserves prompt-to-reload lifecycle).

self.addEventListener('install', (event) => {
  // Do not call skipWaiting — new SW waits until old tabs are closed.
  event.waitUntil(Promise.resolve());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
  // Note: clients.claim() here is acceptable — this is the FIRST SW install,
  // not an update. There is no prior app-code+DB version to protect against.
});

self.addEventListener('fetch', (event) => {
  // Pass-through: intercepts /data/* fetches from the /app page (SW scope
  // controls pages, not paths — see ARCHITECTURE.md §1).
  // DevTools Network shows "(ServiceWorker)" as the initiator for /data/* fetches,
  // satisfying ROUTE-02 criterion 4 without caching anything.
  event.respondWith(fetch(event.request));
});
```

**Rationale for `clients.claim()` in activate:** D-06 says no `skipWaiting`/`clientsClaim` to preserve prompt-to-reload. However, for the *initial* install (no prior SW), `clients.claim()` in `activate` is acceptable — it makes the SW control already-open `/app` tabs immediately rather than waiting for a reload. This is not "auto-update behavior" (there is nothing to update from). Phase 148 will review this when real precaching is added. Leave a comment explaining this distinction.

### Pattern 3: `src/app-entry.ts` Composition

`src/bee-atlas.ts` bootstraps `<bee-atlas>` by importing it as a side effect (the `@customElement` decorator registers it with `customElements`). To reuse the same component at `/app`, `app-entry.ts` imports `bee-atlas.ts` and adds the SW registration:

```typescript
// src/app-entry.ts
// Vite entry for the /app route.
// Imports <bee-atlas> (same component as /) plus SW registration.
// /app/index.html references this file; _pages/index.html references
// src/bee-atlas.ts directly and MUST NOT import this file — that
// structural separation is the no-SW-on-/ guarantee.
import './bee-atlas.ts';
import './sw-registration.ts';
```

The CSS import (`./index.css`) is already in `_pages/app/index.html` as a `<link rel="stylesheet">`, mirroring `_pages/index.html`. No separate CSS import in `app-entry.ts` is needed.

[VERIFIED: `_pages/index.html` has `<link rel="stylesheet" href="./src/index.css" />` separate from the script tag; `src/bee-atlas.ts` line 1 imports from `lit` — it does not import `./index.css` inline]

### Pattern 4: `src/sw-registration.ts`

```typescript
// src/sw-registration.ts
// Registers the /app service worker.
// Imported ONLY by src/app-entry.ts.
// _pages/index.html → src/bee-atlas.ts never imports this file,
// guaranteeing / has no service worker (structural, not runtime).

export async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/app/sw.js', { scope: '/app' });
  } catch (err) {
    console.error('[SW] Registration failed:', err);
  }
}

registerServiceWorker();
```

No top-level await is needed; the function is called immediately as a side effect. The registration is fire-and-forget — Phase 148 will add the Workbox Window update lifecycle listener here.

### Pattern 5: CDK No-Cache Behaviors (mirror of `/data/*` pattern)

The existing `/data/*` behavior uses:
- `dataCachePolicy` (CachePolicy with `headerBehavior: allowList('Origin')`, `defaultTtl: 1 day`)
- `dataCorsPolicy` (ResponseHeadersPolicy with `corsBehavior`)
- `distribution.addBehavior('/data/*', origin, { cachePolicy, responseHeadersPolicy })`

For the new SW/manifest no-cache behaviors, mirror this with different policy content:

```typescript
// Zero-TTL cache policy for SW and manifest — forces CloudFront to
// revalidate on every request (SW update detection requires this).
const swNoCachePolicy = new cloudfront.CachePolicy(this, 'SwNoCachePolicy', {
  defaultTtl: cdk.Duration.seconds(0),
  maxTtl: cdk.Duration.seconds(0),
  minTtl: cdk.Duration.seconds(0),
  queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
  cookieBehavior: cloudfront.CacheCookieBehavior.none(),
  enableAcceptEncodingGzip: false,
  enableAcceptEncodingBrotli: false,
});

// Response headers policy: set Cache-Control: no-cache so the browser
// always revalidates the SW script (browser enforces max 24h SW check
// interval; CloudFront long-TTL can delay updates beyond that window).
const swNoCacheHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, 'SwNoCacheHeadersPolicy', {
  customHeadersBehavior: {
    customHeaders: [{
      header: 'Cache-Control',
      value: 'no-cache, no-store, must-revalidate',
      override: true,
    }],
  },
});

// A SINGLE shared origin reference for both new behaviors.
const swOrigin = origins.S3BucketOrigin.withOriginAccessControl(siteBucket);

distribution.addBehavior('/app/sw.js', swOrigin, {
  viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
  cachePolicy: swNoCachePolicy,
  responseHeadersPolicy: swNoCacheHeadersPolicy,
});

distribution.addBehavior('/app/manifest.webmanifest', swOrigin, {
  viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
  cachePolicy: swNoCachePolicy,
  responseHeadersPolicy: swNoCacheHeadersPolicy,
});
```

[VERIFIED: `infra/lib/beeatlas-stack.ts` lines 53-96; CDK CloudFormation output shows `CacheBehaviors` with `PathPattern`, `CachePolicyId` (Ref), `ResponseHeadersPolicyId` (Ref) structure; `ResponseHeadersPolicy` with `customHeadersBehavior` renders `CustomHeadersConfig.Items` array in CFN]

### Pattern 6: CDK Template Assertion Test

D-10 requires a template-assertion test. The infra has no test runner. The simplest zero-new-dependency approach: a TypeScript script run via `ts-node` with Node's built-in `assert` module.

**File:** `infra/test/beeatlas-stack.test.ts`

```typescript
// CDK template assertion test for Phase 147.
// Run: cd infra && npx ts-node test/beeatlas-stack.test.ts
// Asserts: two no-cache CloudFront behaviors (/app/sw.js and /app/manifest.webmanifest)
// with Cache-Control: no-cache, no-store, must-revalidate response header.

import * as assert from 'node:assert/strict';
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { GlobalStack } from '../lib/global-stack';
import { BeeAtlasStack } from '../lib/beeatlas-stack';

const app = new cdk.App({
  context: {
    '@aws-cdk/core:bootstrapQualifier': 'beeatlas',
    '@aws-cdk/core:stackRelativeExports': 'true',
  },
});
const globalStack = new GlobalStack(app, 'G', {
  env: { account: '123456789012', region: 'us-east-1' },
  crossRegionReferences: true,
});
const stack = new BeeAtlasStack(app, 'S', {
  env: { account: '123456789012', region: 'us-west-2' },
  crossRegionReferences: true,
  global: globalStack,
});
const template = Template.fromStack(stack);

// Assert: /app/sw.js behavior exists with a zero-TTL cache policy
template.hasResourceProperties('AWS::CloudFront::Distribution', {
  DistributionConfig: {
    CacheBehaviors: Match.arrayWith([
      Match.objectLike({ PathPattern: '/app/sw.js' }),
    ]),
  },
});

// Assert: /app/manifest.webmanifest behavior exists
template.hasResourceProperties('AWS::CloudFront::Distribution', {
  DistributionConfig: {
    CacheBehaviors: Match.arrayWith([
      Match.objectLike({ PathPattern: '/app/manifest.webmanifest' }),
    ]),
  },
});

// Assert: a ResponseHeadersPolicy with Cache-Control: no-cache header exists
template.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
  ResponseHeadersPolicyConfig: {
    CustomHeadersConfig: {
      Items: Match.arrayWith([
        Match.objectLike({
          Header: 'Cache-Control',
          Value: Match.stringLikeRegexp('no-cache'),
          Override: true,
        }),
      ]),
    },
  },
});

// Assert: a zero-TTL CachePolicy exists (DefaultTTL=0, MaxTTL=0)
template.hasResourceProperties('AWS::CloudFront::CachePolicy', {
  CachePolicyConfig: {
    DefaultTTL: 0,
    MaxTTL: 0,
  },
});

console.log('All CDK assertions passed.');
```

**Wire into `infra/package.json`:**
```json
"scripts": {
  "test": "npx ts-node test/beeatlas-stack.test.ts",
  ...
}
```

[VERIFIED: `aws-cdk-lib/assertions` exports `Template`, `Match` — confirmed available in `infra/node_modules`; `ts-node` installed; existing dist/ compiled from prior `npm run build` is available for import]

**Note:** The test imports from `../lib/` (TypeScript source, not `../dist/`). `ts-node` compiles on the fly. If the test is added to CI, `npm run build` in `infra/` must run first OR `ts-node` handles compilation. Since `ts-node` handles TypeScript directly, no `npm run build` prerequisite is needed for the test.

### Anti-Patterns to Avoid

- **Passthrough instead of template for `_pages/app/index.html`:** `addPassthroughCopy` bypasses `results` counting in `eleventy-plugin-vite`, causing Vite to skip the build pass — the `<script type="module" src="./src/app-entry.ts">` tag is never rewritten to point at hashed assets.
- **Importing `sw-registration.ts` from `bee-atlas.ts` or `_pages/index.html`:** This would register a SW on `/`, contaminating the main route. The no-SW-on-`/` guarantee is purely structural — `_pages/index.html` references `src/bee-atlas.ts` which must never import `sw-registration.ts`.
- **Placing `sw.js` under `src/` (Vite-processed):** Vite would content-hash it (e.g. `/assets/sw-abc123.js`). The browser uses the SW script URL to detect updates; a new URL on every build means the browser treats it as a brand-new SW, not an update. Always serve from `public/app/sw.js`.
- **`addBehavior('/app/*', ...)` instead of per-path behaviors:** A single `/app/*` behavior would apply no-cache to the entire `/app/` tree including `index.html` and all assets — breaking the app shell caching that Phase 148 will rely on. Use per-path behaviors: `/app/sw.js` and `/app/manifest.webmanifest` only.
- **Setting `viteOptions.root` or `viteOptions.build.outDir`:** `eleventy.config.js` comment line 52-53 explicitly warns against this; the plugin overrides these at build time.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Eleventy page exclusion from collections | Custom collection filter | `eleventyExcludeFromCollections: true` front matter | Built-in Eleventy front matter key; no code needed |
| CloudFront no-cache header injection | Lambda@Edge function | `ResponseHeadersPolicy` with `customHeadersBehavior` | CDK L2 construct; no compute cost; set at edge |
| CDK template assertions | Hand-parsing CloudFormation JSON | `aws-cdk-lib/assertions` `Template.fromStack()` | Already installed; `Match.arrayWith`/`Match.objectLike` handles nested structures cleanly |

---

## Common Pitfalls

### Pitfall 1: `results.length === 0` — Vite skips the build pass

**What goes wrong:** `_pages/app/index.html` is added via `addPassthroughCopy` instead of being an Eleventy template. Vite runs but sees no Eleventy-produced HTML to process. The `<script type="module" src="./src/app-entry.ts">` tag in the output is unchanged — it references the raw `.ts` file, which the browser cannot load.

**How to avoid:** No `addPassthroughCopy` for `_pages/app/index.html`. Let Eleventy template it normally (it is plain HTML — Eleventy will pass it through its pipeline as a template, producing `_site/app/index.html`, and `results` will be non-empty).

**Warning sign:** After `npm run build`, `_site/app/index.html` still contains `src="./src/app-entry.ts"` (the unhashed path).

### Pitfall 2: SW on `/` due to import topology leak

**What goes wrong:** `sw-registration.ts` is imported directly by `bee-atlas.ts` or indirectly through a shared import chain reachable from `_pages/index.html`.

**How to avoid:** `sw-registration.ts` is imported ONLY by `src/app-entry.ts`. Verify with `grep -r "sw-registration" src/` — only one hit expected (in `app-entry.ts`). After the build, open `http://localhost/` in DevTools → Application → Service Workers and confirm "No service workers detected."

### Pitfall 3: CloudFront `/app/*` wildcard behavior caching all `/app/` assets

**What goes wrong:** Using `/app/*` as the path pattern sets no-cache for the entire `/app/` subtree — including the app shell HTML and all hashed JS/CSS. Phase 148 relies on the app shell being cacheable.

**How to avoid:** Use exact path patterns: `/app/sw.js` and `/app/manifest.webmanifest`. No wildcard.

### Pitfall 4: CDK assertion test instantiates real AWS resources

**What goes wrong:** Running `cdk synth` or using `Template.fromStack()` requires `CDK_DEFAULT_ACCOUNT` and `CDK_DEFAULT_REGION`. Without them, CloudFormation tokens resolve to `{"Ref":"AWS::AccountId"}` etc., which can cause assertions like `Match.stringLikeRegexp` on ARNs to fail.

**How to avoid:** Pass explicit fake account/region strings in the test App constructor: `env: { account: '123456789012', region: 'us-west-2' }`. The template assertions test CloudFormation *structure*, not AWS-resolved values. [VERIFIED: the above assertion pattern was tested with fake account IDs and confirms the `CacheBehaviors` and `ResponseHeadersPolicy` structures correctly]

### Pitfall 5: `vite preview` doesn't serve `public/data/manifest.json` for real DB

**What goes wrong:** `npm run preview` serves `_site/` which includes the production-built assets but NOT `public/data/` (those files are not part of the Eleventy build output — they're served separately in production from the S3 bucket). The SW pass-through handler will fetch `/data/occurrences.db` from the preview server, which returns 404 since `_site/data/` doesn't exist.

**How to avoid for D-11 verification:** Before `npm run build && npm run preview`, run `npm run predev` (which runs `scripts/make-local-manifest.js`) and ensure `public/data/occurrences.db` exists (from `npm run fetch-data` or a prior local run). Alternatively, copy `public/data/` into `_site/data/` manually before running `vite preview`. The DevTools SW scope and registration check (no-SW-on-`/`, SW-on-`/app`, fetch intercepted) does not require the DB to load successfully — the *registration* and *interception* are verifiable even if the DB fetch returns 404.

---

## Code Examples

### Verified: `/data/*` CacheBehavior CFN structure (currently synthesized)

```json
{
  "CachePolicyId": { "Ref": "DataCachePolicy6B8D1C88" },
  "Compress": true,
  "PathPattern": "/data/*",
  "ResponseHeadersPolicyId": { "Ref": "DataCorsPolicy1FB80CC2" },
  "TargetOriginId": "SSiteDistributionOrigin27887370B",
  "ViewerProtocolPolicy": "redirect-to-https"
}
```

The new behaviors will render with the same structure, with `PathPattern: "/app/sw.js"` and `"/app/manifest.webmanifest"`. [VERIFIED: `infra/lib/beeatlas-stack.ts` + CDK synthesis run]

### Verified: ResponseHeadersPolicy CFN output for `customHeadersBehavior`

```json
{
  "ResponseHeadersPolicyConfig": {
    "CustomHeadersConfig": {
      "Items": [
        {
          "Header": "Cache-Control",
          "Override": true,
          "Value": "no-cache, no-store, must-revalidate"
        }
      ]
    },
    "Name": "..."
  }
}
```

[VERIFIED: CDK `ResponseHeadersPolicy` with `customHeadersBehavior` synthesized and inspected]

### Verified: Eleventy `eleventyExcludeFromCollections` pattern

```njk
---
eleventyExcludeFromCollections: true
---
```

Used in `_pages/scaffold-check.njk` — the same syntax works in `.html` files with Eleventy front matter. [VERIFIED: `_pages/scaffold-check.njk` lines 1-5]

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SW at root `/sw.js` (global scope) | SW at `/app/sw.js` (scoped to `/app`) | Phase 147 decision | No SW contamination of main route |
| No CDK test runner in `infra/` | ts-node script + `aws-cdk-lib/assertions` | Phase 147 (new) | Regression protection for no-cache behavior without deploying |

**No deprecated patterns apply to this phase.** The build pipeline, CDK constructs, and Eleventy/Vite plugin are all at current versions with no API migrations needed.

---

## Assumptions Log

> All claims in this research were verified against the actual codebase or CDK synthesis output. No `[ASSUMED]` tags.

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `clients.claim()` in the stub SW's `activate` handler is acceptable for initial install (no prior SW version) | Code Examples, Pattern 2 | If user has strong preference for no `clients.claim()` either, remove it — the SW will control new page loads automatically without it; the difference is whether already-open `/app` tabs are controlled before reload. Low risk either way. |

---

## Open Questions

1. **CDK test integration into CI**
   - What we know: CI runs `npm test` from repo root (deploy.yml); `infra/` has no test script yet.
   - What's unclear: Should the CDK assertion test be wired into CI at all in Phase 147, or is local `ts-node` invocation sufficient (with HUMAN-UAT covering the `curl -I` check)?
   - Recommendation: Add `npm run test` to `infra/package.json` for the ts-node assertion script; leave CI wiring to the implementer's judgment (not blocking Phase 147 success criteria).

2. **`clients.claim()` in stub SW activate**
   - What we know: D-06 says no `skipWaiting`/`clientsClaim`. However `clients.claim()` without `skipWaiting` is meaningfully different: it claims already-open tabs after activation but doesn't force the waiting SW to skip its waiting state.
   - What's unclear: Whether "no clientsClaim" is a hard requirement or just "no auto-update pattern."
   - Recommendation: Include `clients.claim()` in `activate` but document the distinction; remove it if the user prefers maximum lifecycle purity.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build pipeline, CDK test | ✓ | v24.12.0 | — |
| `eleventy` + `eleventy-plugin-vite` | `_pages/app/index.html` build | ✓ | `^3.1.5` / `^8.0.0` | — |
| `vite` | `src/app-entry.ts` bundling | ✓ | `^8.0.16` | — |
| `aws-cdk-lib` (infra) | CDK behaviors + assertion test | ✓ | `^2.238.0` | — |
| `ts-node` (infra) | CDK assertion test execution | ✓ | `^10.9.2` | — |
| `aws-cdk-lib/assertions` | Template assertion test | ✓ | (bundled with aws-cdk-lib 2.238.0) | — |
| `vite preview` | D-11 local prod-build SW verification | ✓ | (part of vite) | — |
| `public/data/occurrences.db` | D-11 SW intercept demonstration (optional) | ✓ | (local dev file) | SW scope/registration verifiable without DB loading |

**Missing dependencies with no fallback:** None.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest `^4.1.2` (root) + ts-node (infra CDK assertion) |
| Config file | `vite.config.ts` (root, `test.environment: 'happy-dom'`) |
| Quick run command | `npm test` (root — Vitest; `VITEST_SKIP_BUILD=1 npm test` to skip build-output tests) |
| Full suite command | `npm test` (root) + `cd infra && npx ts-node test/beeatlas-stack.test.ts` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ROUTE-01 | `/app` page builds; `eleventyExcludeFromCollections: true` excludes from collections; `/` unchanged | build-output (extend existing) | `npm test` (build-output.test.ts; skipIf VITEST_SKIP_BUILD=1) | ✅ extend `_site/app/index.html` check into `build-output.test.ts` |
| ROUTE-02 | SW registered at `/app/sw.js` with `scope: '/app'`; no SW on `/`; SW intercepts `/data/*` fetch | manual (DevTools) — D-11 | `npm run build && npm run preview` → DevTools verification | N/A manual |
| ROUTE-03 | CloudFront behaviors exist for `/app/sw.js` and `/app/manifest.webmanifest` with no-cache headers | CDK template assertion | `cd infra && npx ts-node test/beeatlas-stack.test.ts` | ❌ Wave 0: create `infra/test/beeatlas-stack.test.ts` |

### Sampling Rate

- **Per task commit:** `VITEST_SKIP_BUILD=1 npm test` (fast tier, skips build-output tests)
- **Per wave merge:** `npm test` (full Vitest suite including build-output) + `cd infra && npx ts-node test/beeatlas-stack.test.ts`
- **Phase gate:** Full suite green + CDK assertion passes + HUMAN-UAT `curl -I` spot-check before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `infra/test/beeatlas-stack.test.ts` — CDK template assertion (REQ ROUTE-03)
- [ ] Extend `src/tests/build-output.test.ts` with a test that `_site/app/index.html` exists and references a hashed `/assets/app-entry-*.js` chunk (REQ ROUTE-01)

---

## Security Domain

> Security enforcement applies. These are the relevant ASVS categories for this phase.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth in Phase 147 |
| V3 Session Management | no | No session state |
| V4 Access Control | no | Route is intentionally public (unlisted by nav, not by access control) |
| V5 Input Validation | no | No user input in Phase 147 |
| V6 Cryptography | no | No crypto |

### Known Threat Patterns for SW Topology

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SW scope bleed onto `/` | Tampering | Import topology: `_pages/index.html` never imports `sw-registration.ts`; verified by grep + DevTools after build |
| SW script URL changes on every build (hash) | Tampering | Serve from `public/app/sw.js` (Vite passthrough, not processed) — stable URL guaranteed |
| CloudFront caches SW with long TTL | Tampering / Denial | `ResponseHeadersPolicy` with `Cache-Control: no-cache, no-store, must-revalidate` on `/app/sw.js` behavior |

---

## Sources

### Primary (HIGH confidence — verified against source files)

- `eleventy.config.js` — plugin wiring, passthrough mechanism, `results.length === 0` failure mode explanation (lines 22-46)
- `_pages/index.html` — exact SPA template pattern (all 15 lines)
- `src/bee-atlas.ts` (lines 1-15) — entry import chain; `<bee-atlas>` bootstrap pattern
- `infra/lib/beeatlas-stack.ts` — `/data/*` `addBehavior` + `ResponseHeadersPolicy` + `CachePolicy` pattern (lines 53-96)
- `_pages/scaffold-check.njk` — `eleventyExcludeFromCollections: true` front matter pattern
- CDK synthesis output (CJS `node` run against compiled `dist/`) — confirmed `CacheBehaviors` JSON structure and `ResponseHeadersPolicy` `CustomHeadersConfig.Items` structure
- `aws-cdk-lib/assertions` `Template` methods — confirmed via `Object.getOwnPropertyNames(Template.prototype)` inspection

### Secondary (MEDIUM confidence — research docs in this repo)

- `.planning/research/ARCHITECTURE.md` §1 — SW scope = page control (not fetch path filtering); confirmed by MDN citation in doc
- `.planning/research/PITFALLS.md` Pitfall 1 — SW scope bleed; sw.js hash pitfall; CDK no-cache requirement
- `.planning/research/SUMMARY.md` §Conflict Resolutions — `Service-Worker-Allowed` is NOT needed for `/app`-scoped SW to intercept `/data/*`

---

## Metadata

**Confidence breakdown:**
- Eleventy+Vite template pattern: HIGH — verified against actual source files
- CDK behavior pattern: HIGH — verified against actual running synthesis
- CDK assertion test pattern: HIGH — verified `Template`/`Match` API available and working
- SW topology: HIGH — ARCHITECTURE.md cites MDN; consistent with D-03/D-04 decisions
- No-SW-on-`/` guarantee: HIGH — import topology verified in `_pages/index.html` + `src/bee-atlas.ts`

**Research date:** 2026-06-10
**Valid until:** 2026-12-10 (stable stack; no fast-moving dependencies)

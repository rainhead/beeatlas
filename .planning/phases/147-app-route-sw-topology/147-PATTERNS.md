# Phase 147: `/app` Route + SW Topology — Pattern Map

**Mapped:** 2026-06-10
**Files analyzed:** 7 (4 new, 1 modified CDK stack, 1 new CDK test, 1 modified Vitest test)
**Analogs found:** 6 / 7 (1 greenfield — `src/sw-registration.ts`)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `_pages/app/index.html` | template (SPA entry) | request-response | `_pages/index.html` | exact |
| `src/app-entry.ts` | entry (Vite) | request-response | `src/bee-atlas.ts` (lines 1–14) | role-match |
| `src/sw-registration.ts` | utility (browser side-effect) | event-driven | — | no analog |
| `public/app/sw.js` | service worker stub | event-driven | — | no analog (greenfield JS) |
| `infra/lib/beeatlas-stack.ts` (MODIFIED) | config/IaC | request-response | itself, lines 53–96 (`/data/*` behavior block) | exact (extend in-file) |
| `infra/test/beeatlas-stack.test.ts` | test (CDK assertion) | request-response | `src/tests/build-output.test.ts` (test structure) | partial-match |
| `src/tests/build-output.test.ts` (MODIFIED) | test (build-output) | request-response | itself (lines 1–292) | exact (extend in-file) |

---

## Pattern Assignments

### `_pages/app/index.html` (template, request-response)

**Analog:** `_pages/index.html` (all 15 lines)

**Exact template to mirror** (`_pages/index.html` lines 1–15):
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>BeeAtlas</title>
    <link rel="icon" href="data:,">
    <link rel="alternate" type="application/atom+xml" title="Washington Bee Atlas — All Recent Determinations" href="/data/feeds/determinations.xml">
    <link rel="stylesheet" href="./src/index.css" />
    <script type="module" src="./src/bee-atlas.ts"></script>
  </head>
  <body>
    <bee-atlas></bee-atlas>
  </body>
</html>
```

**Modifications required** (D-01, D-02, D-07):
1. Add front-matter block (`---` delimiter) before `<!doctype html>` — use `_pages/scaffold-check.njk` lines 1–5 as the front-matter syntax reference.
2. Set `eleventyExcludeFromCollections: true` in front matter (D-07).
3. Replace `<script type="module" src="./src/bee-atlas.ts">` with `src="./src/app-entry.ts"` (D-02).
4. Remove the `<link rel="alternate">` Atom feed line (not needed on the app page).

**Resulting `_pages/app/index.html`:**
```html
---
eleventyExcludeFromCollections: true
---
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

**Critical constraint (eleventy.config.js lines 22–28):** This file MUST be an Eleventy template — NOT a `addPassthroughCopy` target. If it were a passthrough, `eleventy-plugin-vite` would see `results.length === 0` and skip its Vite build pass; the `<script type="module">` tag would never be rewritten to point at hashed assets.

---

### `src/app-entry.ts` (Vite entry, request-response)

**Analog:** `src/bee-atlas.ts` lines 1–14 (import chain pattern)

**Import pattern from `src/bee-atlas.ts`** (lines 1–14):
```typescript
import { css, html, LitElement, type PropertyValues } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { ... } from './filter.ts';
import { parseOccId } from './occurrence.ts';
import { buildParams, parseParams, type SourceKey } from './url-state.ts';
import { getDB, loadOccurrencesTable, tablesReady } from './sqlite.ts';
import { markTaxaReady, taxaReady } from './ready.ts';
import type { DataSummary, TaxonOption, FilterChangedEvent } from './filter.ts';
import { buildTaxonOptions, resolveTaxonDisplayName, type TaxonCacheEntry } from './taxa.ts';
import type { FeatureCollection, Point } from 'geojson';
import { makeStaleGuard } from './stale-guard.ts';
import './bee-header.ts';
import './bee-pane.ts';
import './bee-map.ts';
```

**Core entry pattern (D-02, D-03):** `app-entry.ts` is a side-effect-only entry. It imports `bee-atlas.ts` (which registers `<bee-atlas>` via `@customElement` decorator) and `sw-registration.ts` (which calls `navigator.serviceWorker.register`). No class definition, no exports needed.

**`src/app-entry.ts` content:**
```typescript
// Vite entry for the /app route.
// Imports <bee-atlas> (same component as /) plus SW registration.
// _pages/index.html references src/bee-atlas.ts directly and MUST NOT
// import this file — that structural separation is the no-SW-on-/ guarantee.
import './bee-atlas.ts';
import './sw-registration.ts';
```

Note: The CSS import (`./src/index.css`) is handled by the `<link rel="stylesheet">` in `_pages/app/index.html`, mirroring `_pages/index.html`. No CSS import in `app-entry.ts`.

---

### `src/sw-registration.ts` (utility, event-driven)

**Analog:** None — greenfield. No existing browser-side service-worker registration module exists in the codebase.

**Content per D-03, research Pattern 4:**
```typescript
// Registers the /app service worker.
// Imported ONLY by src/app-entry.ts.
// _pages/index.html -> src/bee-atlas.ts never imports this file,
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

No top-level await. Registration is fire-and-forget side effect called immediately on import.

---

### `public/app/sw.js` (service worker stub, event-driven)

**Analog:** None — greenfield plain JavaScript. The file lives in `public/app/sw.js` so Vite copies it to `_site/app/sw.js` without hashing (via the two-step passthrough described in `eleventy.config.js` lines 35–46 and research Pattern 2).

**Content per D-05, D-06:**
```javascript
// Phase 147 stub — pass-through only, no caching.
// No skipWaiting / clientsClaim, even in the stub (D-06: preserves the
// prompt-to-reload lifecycle). Both are excluded — this is non-negotiable.

self.addEventListener('install', (event) => {
  // Do not call skipWaiting — new SW waits until old tabs are closed.
  event.waitUntil(Promise.resolve());
});

self.addEventListener('activate', (event) => {
  // Bare activate listener — no clients.claim() (D-06). Already-open /app
  // tabs are controlled after the next reload, not immediately. Logging is
  // fine here; claiming clients is not.
});

self.addEventListener('fetch', (event) => {
  // Pass-through: intercepts /data/* fetches from the /app page (SW scope
  // controls pages, not paths — see ARCHITECTURE.md §1).
  // DevTools Network shows "(ServiceWorker)" as initiator for /data/* fetches,
  // satisfying ROUTE-02 criterion 4 without caching anything.
  event.respondWith(fetch(event.request));
});
```

---

### `infra/lib/beeatlas-stack.ts` MODIFIED (IaC/config, request-response)

**Analog:** itself, lines 53–96 — the existing `/data/*` behavior block. The two new behaviors mirror this block exactly in CDK construct types and calling convention.

**Imports pattern** (`infra/lib/beeatlas-stack.ts` lines 1–10) — no new imports needed:
```typescript
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import { Construct } from 'constructs';
import { GlobalStack } from './global-stack';
```

**Existing `/data/*` behavior analog** (`infra/lib/beeatlas-stack.ts` lines 53–96):
```typescript
// ── /data/* cache behavior with CORS headers ──────────────────────────
const dataCachePolicy = new cloudfront.CachePolicy(this, 'DataCachePolicy', {
  headerBehavior: cloudfront.CacheHeaderBehavior.allowList('Origin'),
  queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
  cookieBehavior: cloudfront.CacheCookieBehavior.none(),
  defaultTtl: cdk.Duration.days(1),
  maxTtl: cdk.Duration.days(365),
  minTtl: cdk.Duration.seconds(0),
  enableAcceptEncodingGzip: true,
  enableAcceptEncodingBrotli: true,
});

const dataCorsPolicy = new cloudfront.ResponseHeadersPolicy(this, 'DataCorsPolicy', {
  corsBehavior: {
    accessControlAllowCredentials: false,
    accessControlAllowHeaders: ['*'],
    accessControlAllowMethods: ['GET', 'HEAD'],
    accessControlAllowOrigins: ['*'],
    accessControlExposeHeaders: ['Content-Range', 'Content-Length', 'ETag'],
    originOverride: true,
  },
});

distribution.addBehavior('/data/*',
  origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
  {
    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    cachePolicy: dataCachePolicy,
    responseHeadersPolicy: dataCorsPolicy,
    compress: true,
  }
);
```

**New block to add after line 96** (D-08, D-09) — mirror the construct types, use `customHeadersBehavior` instead of `corsBehavior`, zero TTL instead of 1-day TTL, per-path behaviors (NOT `/app/*` wildcard — anti-pattern per PITFALL-3):
```typescript
// ── /app/sw.js + /app/manifest.webmanifest: no-cache behaviors ───────
// Zero-TTL so CloudFront revalidates on every request. SW update
// detection requires the browser to always fetch the latest sw.js.
const swNoCachePolicy = new cloudfront.CachePolicy(this, 'SwNoCachePolicy', {
  defaultTtl: cdk.Duration.seconds(0),
  maxTtl: cdk.Duration.seconds(0),
  minTtl: cdk.Duration.seconds(0),
  queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
  cookieBehavior: cloudfront.CacheCookieBehavior.none(),
  enableAcceptEncodingGzip: false,
  enableAcceptEncodingBrotli: false,
});

const swNoCacheHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, 'SwNoCacheHeadersPolicy', {
  customHeadersBehavior: {
    customHeaders: [{
      header: 'Cache-Control',
      value: 'no-cache, no-store, must-revalidate',
      override: true,
    }],
  },
});

distribution.addBehavior('/app/sw.js',
  origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
  {
    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    cachePolicy: swNoCachePolicy,
    responseHeadersPolicy: swNoCacheHeadersPolicy,
  }
);

distribution.addBehavior('/app/manifest.webmanifest',
  origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
  {
    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    cachePolicy: swNoCachePolicy,
    responseHeadersPolicy: swNoCacheHeadersPolicy,
  }
);
```

**Insertion point:** After the closing `);` of `distribution.addBehavior('/data/*', ...)` at line 96, before the Route 53 records block at line 98.

**CloudFormation rendered structure** (verified via CDK synthesis) — what the assertion test will match:
```json
{
  "CachePolicyId": { "Ref": "SwNoCachePolicyXXXXXXXX" },
  "PathPattern": "/app/sw.js",
  "ResponseHeadersPolicyId": { "Ref": "SwNoCacheHeadersPolicyXXXXXXXX" },
  "ViewerProtocolPolicy": "redirect-to-https"
}
```

---

### `infra/test/beeatlas-stack.test.ts` (test/CDK assertion, request-response)

**Analog (structure):** `src/tests/build-output.test.ts` — overall test-script pattern (imports, setup, assertions). Content uses `aws-cdk-lib/assertions` `Template`/`Match` API (no analog in codebase — new pattern).

**Build-output test structure analog** (`src/tests/build-output.test.ts` lines 1–19):
```typescript
import { describe, test, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SKIP_BUILD = process.env.VITEST_SKIP_BUILD === '1';

describe.skipIf(SKIP_BUILD)('build output (PAGE-07, PAGE-09)', () => {
  beforeAll(() => {
    execSync('npm run build', { cwd: ROOT, stdio: 'pipe' });
  }, 180_000);
  ...
```

**CDK test has a different runtime:** `ts-node` (CommonJS) + `node:assert`, not Vitest. The infra `tsconfig.json` uses `"module": "commonjs"`. Use `node:assert/strict` imports, not Vitest `expect`.

**Stack constructor pattern** (`infra/lib/beeatlas-stack.ts` lines 16–21):
```typescript
export class BeeAtlasStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: BeeAtlasStackProps) {
    super(scope, id, props);
    const { netZone, comZone, siteCert, redirectCert } = props.global;
```

`BeeAtlasStack` requires a `GlobalStack` instance (`props.global`). The test must instantiate `GlobalStack` first with a fake `us-east-1` env (where ACM certs live), then `BeeAtlasStack` with `us-west-2`.

**CDK assertion test content:**
```typescript
// CDK template assertion test for Phase 147.
// Run: cd infra && npx ts-node test/beeatlas-stack.test.ts
// Asserts: two no-cache CloudFront behaviors (/app/sw.js, /app/manifest.webmanifest)
// with Cache-Control: no-cache, no-store, must-revalidate response header.

import * as assert from 'node:assert/strict';
import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { GlobalStack } from '../lib/global-stack';
import { BeeAtlasStack } from '../lib/beeatlas-stack';

const app = new cdk.App();
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

// Assert: /app/sw.js behavior exists in CacheBehaviors
template.hasResourceProperties('AWS::CloudFront::Distribution', {
  DistributionConfig: {
    CacheBehaviors: Match.arrayWith([
      Match.objectLike({ PathPattern: '/app/sw.js' }),
    ]),
  },
});

// Assert: /app/manifest.webmanifest behavior exists in CacheBehaviors
template.hasResourceProperties('AWS::CloudFront::Distribution', {
  DistributionConfig: {
    CacheBehaviors: Match.arrayWith([
      Match.objectLike({ PathPattern: '/app/manifest.webmanifest' }),
    ]),
  },
});

// Assert: a ResponseHeadersPolicy with Cache-Control: no-cache exists
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

**Wire into `infra/package.json` scripts:**
```json
"test": "npx ts-node test/beeatlas-stack.test.ts"
```

**Pitfall (RESEARCH Pitfall 4):** Pass explicit `env: { account: '123456789012', region: '...' }` in both stack constructors. Without explicit account/region, CDK tokens render as `{"Ref":"AWS::AccountId"}` and some assertions may fail.

---

### `src/tests/build-output.test.ts` MODIFIED (test/build-output, request-response)

**Analog:** itself — extend the existing `describe.skipIf(SKIP_BUILD)` block.

**Existing test structure** (`src/tests/build-output.test.ts` lines 1–19):
```typescript
import { describe, test, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SKIP_BUILD = process.env.VITEST_SKIP_BUILD === '1';

describe.skipIf(SKIP_BUILD)('build output (PAGE-07, PAGE-09)', () => {
  beforeAll(() => {
    execSync('npm run build', { cwd: ROOT, stdio: 'pipe' });
  }, 180_000);
```

**Existing `existsSync` pattern** (line 9, used at lines 271–272):
```typescript
expect(existsSync(resolve(ROOT, '_site/places/rattlesnake-ledge.html'))).toBe(true);
expect(existsSync(resolve(ROOT, '_site/places/rattlesnake-ledge/index.html'))).toBe(false);
```

**Existing hashed-chunk assertion pattern** (lines 264–267 — how hashed-asset `src` is matched in built HTML):
```typescript
expect(indexHtml).toMatch(/src="\/assets\/bee-header-[^"]+\.js"/);
expect(detailHtml).toMatch(/src="\/assets\/bee-header-[^"]+\.js"/);
```

**New tests to append inside the existing `describe.skipIf(SKIP_BUILD)` block** (D-12, ROUTE-01):
```typescript
// Phase 147 — /app route build output (ROUTE-01)

test('emits _site/app/index.html (ROUTE-01)', () => {
  expect(existsSync(resolve(ROOT, '_site/app/index.html'))).toBe(true);
});

test('_site/app/index.html references a hashed app-entry chunk (ROUTE-01)', () => {
  const html = readFileSync(resolve(ROOT, '_site/app/index.html'), 'utf-8');
  // Vite rewrites ./src/app-entry.ts -> /assets/app-entry-<hash>.js
  expect(html).toMatch(/src="\/assets\/app-entry-[^"]+\.js"/);
});

test('_site/app/sw.js exists at unhashed stable URL (D-04)', () => {
  expect(existsSync(resolve(ROOT, '_site/app/sw.js'))).toBe(true);
});
```

**Insertion point:** Append these three tests after the last existing test in the `describe.skipIf(SKIP_BUILD)` block (after line 292, before the closing `}`).

---

## Shared Patterns

### CDK Construct Types
**Source:** `infra/lib/beeatlas-stack.ts` lines 1–10 (imports) and lines 53–96 (construct usage)
**Apply to:** `infra/lib/beeatlas-stack.ts` new behaviors block, `infra/test/beeatlas-stack.test.ts`

The only CDK construct types needed for the new behaviors:
- `cloudfront.CachePolicy(this, 'Id', props)` — `defaultTtl`, `maxTtl`, `minTtl` use `cdk.Duration.seconds(0)`
- `cloudfront.ResponseHeadersPolicy(this, 'Id', { customHeadersBehavior: { customHeaders: [...] } })`
- `distribution.addBehavior(pathPattern, origin, behaviorOptions)` — origin via `origins.S3BucketOrigin.withOriginAccessControl(siteBucket)`

### Eleventy Front Matter Exclusion
**Source:** `_pages/scaffold-check.njk` lines 1–5
**Apply to:** `_pages/app/index.html`

```njk
---
eleventyExcludeFromCollections: true
---
```

This YAML front-matter syntax works identically in `.html` files. The `---` delimiter block must appear before `<!doctype html>`.

### Build-Output Test Import Pattern
**Source:** `src/tests/build-output.test.ts` lines 1–14
**Apply to:** Any new tests added to `src/tests/build-output.test.ts`

```typescript
import { describe, test, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
```

All `_site/` path resolutions use `resolve(ROOT, '_site/...')`.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/sw-registration.ts` | utility (browser side-effect) | event-driven | No existing service-worker registration module in codebase |
| `public/app/sw.js` | service worker stub | event-driven | No existing service workers in codebase; plain JS (not TypeScript) |

Both files have fully specified content in RESEARCH.md (Patterns 3 and 4) — use those directly.

---

## Metadata

**Analog search scope:** `_pages/`, `src/`, `infra/lib/`, `infra/test/`, `src/tests/`
**Files read:** `_pages/index.html`, `src/bee-atlas.ts`, `src/tests/build-output.test.ts`, `infra/lib/beeatlas-stack.ts`, `infra/package.json`, `infra/tsconfig.json`, `_pages/scaffold-check.njk`, `eleventy.config.js`
**Pattern extraction date:** 2026-06-10

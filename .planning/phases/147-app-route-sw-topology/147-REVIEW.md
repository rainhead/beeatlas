---
phase: 147-app-route-sw-topology
reviewed: 2026-06-10T00:00:00Z
depth: standard
files_reviewed: 8
files_reviewed_list:
  - _pages/app/index.html
  - src/app-entry.ts
  - src/sw-registration.ts
  - public/app/sw.js
  - src/tests/build-output.test.ts
  - infra/lib/beeatlas-stack.ts
  - infra/test/beeatlas-stack.test.ts
  - infra/package.json
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues
---

# Phase 147: Code Review Report

**Reviewed:** 2026-06-10
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Phase 147 establishes the `/app` Eleventy+Vite route, a correctly-scoped pass-through service
worker, and two per-path CloudFront no-cache behaviors. The core topology is sound: D-05/D-06
prohibitions (no caching, no `skipWaiting`, no `clients.claim`) are honored; the no-SW-on-`/`
import-topology guarantee holds (single `grep` hit confirmed); the Eleventy front matter is
correct. No hardcoded credentials, no injection surfaces.

Two warnings surface: (1) the CDK regression test does not link the two new CloudFront behaviors
to the no-cache `CachePolicy`/`ResponseHeadersPolicy`, so a future misconfiguration could swap
those behaviors onto a long-TTL policy without tripping the gate; (2) the build-output chunk
regex is underspecified and would accept any `.js` file under `/assets/app/`, including
preload links or async chunks, rather than requiring the primary `type="module"` entry script.
Two info-level items are also noted.

---

## Warnings

### WR-01: CDK test does not verify that `/app/sw.js` and `/app/manifest.webmanifest` behaviors use the no-cache policy

**File:** `infra/test/beeatlas-stack.test.ts:36-74`

**Issue:** The four CDK assertions are structurally decoupled. The test verifies (a) that a behavior with `PathPattern: '/app/sw.js'` exists, (b) that a behavior with `PathPattern: '/app/manifest.webmanifest'` exists, (c) that *some* `ResponseHeadersPolicy` with `Cache-Control: no-cache` exists, and (d) that *some* `CachePolicy` with `DefaultTTL=0, MaxTTL=0` exists — but it never asserts that (a) and (b) are *wired to* (c) and (d). A future regression that accidentally associates those behaviors with `CACHING_OPTIMIZED` instead (while the no-cache policy remains defined elsewhere) would pass all four assertions, silently re-enabling long-TTL caching for `sw.js`.

This is the primary regression gate for ROUTE-03; the weak coupling substantially limits its value.

**Fix:** Extend the behavior assertions to include `CachePolicyId` as a CDK `Ref`. Because `CachePolicyId` is a CloudFormation `{ Ref: "..." }` token in the synthesized template, `Match.objectLike` can match it structurally:

```typescript
// Capture the logical ID of SwNoCachePolicy from the synthesized template
const cachePolicies = template.findResources('AWS::CloudFront::CachePolicy', {
  Properties: { CachePolicyConfig: { DefaultTTL: 0, MaxTTL: 0 } },
});
const noCachePolicyLogicalId = Object.keys(cachePolicies)[0];
assert.ok(noCachePolicyLogicalId, 'Zero-TTL CachePolicy not found');

// Assert /app/sw.js behavior uses the no-cache policy
template.hasResourceProperties('AWS::CloudFront::Distribution', {
  DistributionConfig: {
    CacheBehaviors: Match.arrayWith([
      Match.objectLike({
        PathPattern: '/app/sw.js',
        CachePolicyId: { Ref: noCachePolicyLogicalId },
      }),
    ]),
  },
});
// (same pattern for /app/manifest.webmanifest)
```

---

### WR-02: Build-output chunk assertion regex too broad — matches any `.js` in `/assets/app/`

**File:** `src/tests/build-output.test.ts:303`

**Issue:** The assertion is:
```typescript
expect(html).toMatch(/src="\/assets\/app\/[^"]+\.js"/);
```
This regex matches any `src="..."` attribute referencing *any* `.js` file under `/assets/app/`, including async-loaded chunks, vendor splits, or preload hints that Vite may emit for the same MPA entry. It would also pass if Vite emitted an entirely different chunk name (e.g., `app/shared-abc123.js`) due to a build configuration change, without the actual `app-entry.ts` output being rewritten correctly.

The intent is to assert that Vite rewrote the `<script type="module" src="/src/app-entry.ts">` tag to a hashed asset path. The assertion should pin that it is the `type="module"` entry point, not a coincidental chunk reference.

**Fix:** Tighten the regex to require `type="module"` on the same tag:
```typescript
// Assert the module entry script tag was rewritten by Vite
expect(html).toMatch(/type="module"\s[^>]*src="\/assets\/app\/[^"]+\.js"|src="\/assets\/app\/[^"]+\.js"[^>]*type="module"/);
```
Or, if attribute ordering is consistent from Vite, use:
```typescript
expect(html).toMatch(/src="\/assets\/app\/index-[^"]+\.js"/);
```
The second form pins the known `index-` prefix that Vite MPA mode emits (as documented in the same comment above the assertion), and is simpler and more intention-revealing.

---

## Info

### IN-01: Unused `import * as assert` in CDK test

**File:** `infra/test/beeatlas-stack.test.ts:7`

**Issue:** `import * as assert from 'node:assert/strict'` is imported but `assert` is never referenced in the file body. All assertions use the `template.hasResourceProperties` API from `aws-cdk-lib/assertions`. The import is dead code.

**Fix:** Remove the unused import:
```typescript
// Delete this line:
import * as assert from 'node:assert/strict';
```

---

### IN-02: `registerServiceWorker` is exported but should be module-internal

**File:** `src/sw-registration.ts:6`

**Issue:** The function is declared `export async function registerServiceWorker()`. D-03 states this module is "imported ONLY by `src/app-entry.ts`" and that import is purely for its side effect (`import './sw-registration.ts'`). The named export creates an unnecessary public API surface — if another module ever imports the symbol by name, the no-SW-on-`/` guarantee becomes a lint/convention property rather than a structural one.

**Fix:** Drop the `export` keyword; the function is only called at module bottom as a side effect:
```typescript
async function registerServiceWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/app/sw.js', { scope: '/app' });
  } catch (err) {
    console.error('[SW] Registration failed:', err);
  }
}

registerServiceWorker();
```

---

_Reviewed: 2026-06-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

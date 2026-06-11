# Phase 147: `/app` Route + SW Topology - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-10
**Phase:** 147-app-route-sw-topology
**Areas discussed:** Page content, SW stub behavior, Unlisting, CDK scope, Indexing exposure, Verification approach

> Note: invoked with `--auto`, but the user corrected mid-run ("I confused discuss --auto
> with plan --auto") — session was run **interactively**, not auto-answered, and does **not**
> auto-advance to plan-phase.

---

## Page content (what `/app` renders this phase)

| Option | Description | Selected |
|--------|-------------|----------|
| Full `<bee-atlas>` SPA now | `/app` loads the real map+table SPA; topology + working app land together | ✓ |
| Minimal placeholder page | Near-empty page that only registers the SW and proves scope | |

**User's choice:** Full `<bee-atlas>` SPA now
**Notes:** 148+ then caches a real shell rather than a placeholder. → D-01/D-02

---

## SW stub behavior (`public/app/sw.js` before caching exists)

| Option | Description | Selected |
|--------|-------------|----------|
| Pass-through fetch handler | install/activate + `fetch(event.request)` no-op; proves `/data/*` intercept in DevTools | ✓ |
| No fetch handler (bare SW) | install/activate only; registers + scopes but harder to verify ROUTE-02 crit 4 | |

**User's choice:** Pass-through fetch handler
**Notes:** Chosen so ROUTE-02 criterion 4 is concretely demonstrable this phase. → D-05/D-06

---

## Unlisting `/app`

| Option | Description | Selected |
|--------|-------------|----------|
| `noindex` meta + unlinked | exclude-from-collections + `<meta robots noindex>` + no links | |
| Add robots.txt Disallow too | belt-and-suspenders; but robots.txt publicly advertises the path | |
| Just unlinked (no noindex) | exclude-from-collections + no links only; relies on obscurity | ✓ |

**User's choice:** Just unlinked (no noindex)
**Notes:** Confirmed in follow-up despite the full-SPA + indexable combination being the most
discoverable. Reversible later. → D-07

---

## CDK scope (manifest.webmanifest behavior timing)

| Option | Description | Selected |
|--------|-------------|----------|
| Add both behaviors now | no-cache for `/app/sw.js` AND `/app/manifest.webmanifest`; one infra change | ✓ |
| Only `/app/sw.js` now | add manifest behavior in Phase 151 when the file lands | |

**User's choice:** Add both behaviors now
**Notes:** Path-pattern based, harmless before the manifest file exists in 151. → D-08/D-09

---

## Indexing exposure (follow-up confirmation)

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, unlinked is enough | ship real SPA at `/app`, no `noindex`; rely on no inbound links | ✓ |
| Actually, add noindex | keep full SPA but add `noindex` as cheap insurance | |

**User's choice:** Yes, unlinked is enough
**Notes:** Informed acceptance of the exposure trade-off during dogfooding. → D-07

---

## Verification approach

| Option | Description | Selected |
|--------|-------------|----------|
| CDK assertion + post-deploy curl | `cdk synth` template assertion in suite + post-deploy `curl -I` in HUMAN-UAT | ✓ (ROUTE-03) |
| Post-deploy curl only | no CDK test; curl against live only | |
| Local prod-build preview | DevTools SW checks on `http://localhost` prod build before deploy | ✓ (ROUTE-02) |
| Post-deploy on live site | SW checks only against deployed https | |
| Both local + post-deploy | local first, re-confirm live | |

**User's choice:** CDK assertion + post-deploy curl (ROUTE-03); Local prod-build preview (ROUTE-02)
**Notes:** Automated guard for infra regressions without deploying; fast local SW feedback loop.
→ D-10/D-11/D-12

---

## Claude's Discretion

- Exact CDK construct IDs/naming for the new policies and behaviors.
- Precise pass-through stub SW source; how `app-entry.ts` composes `<bee-atlas>` + registration.
- CDK assertion test file placement/naming.

## Deferred Ideas

- App-shell precache + `vite-plugin-pwa injectManifest` → Phase 148 (replaces 147 stub).
- `/data/` runtime caching → Phase 149.
- Real `manifest.webmanifest` content + icons + installability → Phase 151.
- Harden `/app` with `noindex`/robots if it ever needs it.
- Reviewed-not-folded todo: `144-code-review-deferred.md` (CSV-export headers) — keyword
  false-positive, unrelated to this phase.

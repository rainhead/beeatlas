# Phase 148: App Shell Precache + vite-plugin-pwa Wiring - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-11
**Phase:** 148-app-shell-precache-vite-plugin-pwa-wiring
**Areas presented:** Precache scope, Offline navigation, Verification gate, SW registration

> The user selected **"No preference"** on the area-selection menu — delegating all four
> implementation decisions to Claude's discretion. The decisions below are research-grounded
> defaults (drawn from `.planning/research/` STACK §3 / ARCHITECTURE §2a / PITFALLS 2-3-5, the
> Phase 147 foundation, and the `/app/index.html` canonical-URL memory). They are open to review
> and override before planning.

---

## Precache scope

| Option | Description | Selected |
|--------|-------------|----------|
| Broad glob | `globPatterns: ['app/index.html', 'assets/**/*.{js,css}']`; exclude data/feeds/db/geojson/parquet/png | ✓ (default) |
| Targeted /app deps only | Parse `/app/index.html` import graph, precache exactly its chunks | |

**Decision:** Broad glob — bundles are <100 KB, `/app` shares chunks with `/`, over-precache is cheap and guarantees offline correctness. → D-02

---

## Offline navigation

| Option | Description | Selected |
|--------|-------------|----------|
| Precache HTML + NavigationRoute (scoped to /app/) | `createHandlerBoundToURL('/app/index.html')`, allowlist `/^\/app\//` | ✓ (default) |
| Precache HTML only | Rely on direct `/app/index.html` cache hit; no navigation fallback | |

**Decision:** HTML + scoped NavigationRoute so `/app/`, `/app/index.html`, `/app/?x=…` all reload offline; never shadow the main `/` site. Canonical URL `/app/index.html`. → D-05

---

## Verification gate

| Option | Description | Selected |
|--------|-------------|----------|
| Extend `build-output.test.ts` | CI-enforced gate (Phase 147 pattern): manifest injected, every URL exists in `_site/`, ≥30 MB cap | ✓ (default) |
| Standalone post-build script | Separate script run after build | |

**Decision:** Extend the existing build-output gate — consistent with Phase 147, runs in the CI deploy gate, covers success criteria 1/3/4. → D-08

---

## SW registration

| Option | Description | Selected |
|--------|-------------|----------|
| Keep manual sw-registration.ts (`injectRegister: null`) | Lowest risk; preserves 147 scope fix + no-SW-on-/ guarantee | ✓ (default) |
| Switch to vite-plugin-pwa `virtual:pwa-register` / workbox-window | Nicer update lifecycle, but rewrites 147's registration | |

**Decision:** Keep manual registration; defer workbox-window prompt-to-reload to the OFF-03 phase. Also `manifest: false` (real manifest is Phase 151). → D-06 / D-07

---

## Deferred Ideas

- `/data/*` runtime caching → Phase 149 (uses the ≥30 MB cap set here).
- Mapbox tile caching (TOS-sensitive) → later, behind a flag.
- Cache-priming progress indicator → Phase 149/150.
- Prompt-to-reload update UI → OFF-03 phase.
- Real `manifest.webmanifest` + icons + installability → Phase 151.
- Reviewed-not-folded: `144-code-review-deferred.md` (CSV-export headers) — keyword false-positive.

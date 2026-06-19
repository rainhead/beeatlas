# Phase 151: PWA Manifest & Installability - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-19
**Phase:** 151-pwa-manifest-installability
**Areas discussed:** App icon source, Android Install affordance, iOS A2HS instructions, Manifest colors & splash

---

## App icon source

| Option | Description | Selected |
|--------|-------------|----------|
| You supply artwork | Hand off a high-res square master; derive sizes + maskable padding | |
| Generate a simple mark | Design a clean glyph in-repo as SVG master, export PNGs | ✓ |
| Placeholder for now | Minimal valid set to pass installability, replace before launch | |

**User's choice:** Generate a simple mark.

### Mark design
| Option | Description | Selected |
|--------|-------------|----------|
| Bee on brand navy | Bee glyph on --header-bg navy (rgb(8,13,38)) | |
| Bee on accent green | Bee glyph on --accent green (#2c7a2c) | ✓ |
| Map-pin + bee | Pin/teardrop enclosing a small bee | |

**User's choice:** Bee on accent green.

### Maskable handling
| Option | Description | Selected |
|--------|-------------|----------|
| Single safe-design, both purposes | Bee in safe zone on full-bleed green; same PNGs as any + maskable | ✓ |
| Separate any + maskable | Two designs (tight-crop + padded full-bleed) | |

**User's choice:** Single safe-design serves both.

### Icon build/storage
| Option | Description | Selected |
|--------|-------------|----------|
| Commit PNGs + SVG master | Static assets in public/app/icons/; repro script not build-wired | ✓ |
| Generate at build time | @vite-pwa/assets-generator / sharp in the build | |

**User's choice:** Commit PNGs + SVG master (no new image dep in the pipeline).

**Notes:** No logo/favicon/icon existed in the repo — this set is built from scratch.

---

## Android Install affordance

| Option | Description | Selected |
|--------|-------------|----------|
| Header button next to cache icon | Small Install button in <bee-header> beside cache icon + offline pill | ✓ |
| Dismissible top banner | Slim banner across /app with install + dismiss | |
| Inside the cache popover | Fold Install into the existing cache/offline popover | |

**User's choice:** Header button next to cache icon.

### Lifecycle
| Option | Description | Selected |
|--------|-------------|----------|
| Show while installable, no dismiss | Appears after beforeinstallprompt, clears on install/standalone | ✓ |
| Dismissible, remember in localStorage | Same, plus permanent dismiss persisted | |

**User's choice:** Show while installable, no dismiss.

---

## iOS A2HS instructions

| Option | Description | Selected |
|--------|-------------|----------|
| Header button → popover | Same header slot; Install button opens popover with Share-icon + steps | ✓ |
| Inline dismissible banner | Slim banner with Share-icon + steps, dismissible | |
| Tucked in cache popover | iOS steps as a section in the existing cache popover | |

**User's choice:** Header button → popover (mirrors Android, reuses cache-popover pattern).

### Label & visibility
| Option | Description | Selected |
|--------|-------------|----------|
| 'Install', iOS Safari only | Parity label; shown when iOS + Safari + not standalone | ✓ |
| 'Add to Home Screen', any iOS | Explicit label; any iOS browser when not standalone | |

**User's choice:** 'Install', shown on iOS Safari only.

---

## Manifest colors & splash

| Option | Description | Selected |
|--------|-------------|----------|
| Navy theme + navy splash | theme_color + background_color both navy header color | ✓ |
| Navy theme + white splash | Navy status bar, white splash | |
| Match the loading screen | background_color = app loading-screen color | |

**User's choice:** Navy theme + navy splash (cohesive with installed chrome).

---

## Claude's Discretion

- Exact bee glyph artwork, stroke weights, SVG→PNG generation script/tooling.
- iOS popover copy + Share-icon SVG; iOS-Safari detection implementation.
- New `<bee-install>` component vs. folding into `<bee-header>`; install event wiring.
- `/app` favicon; exact `#080d26` ↔ `rgb(8,13,38)` color-format conversion.
- Test file placement/naming for the manifest assertion.

## Deferred Ideas

- Install-conversion analytics (no analytics layer on a static site).
- Dismissible-with-persistence install prompt (rejected for show-while-installable).
- Richer non-Safari iOS instructions (scoped to Safari-only).
- Separate any vs maskable icon designs (rejected for single safe-zone design).
- `noindex`/robots hardening of `/app` (still not needed).

## Decided without asking (bookkeeping)

- `name: "Washington Bee Atlas"`, `short_name: "BeeAtlas"`.
- `start_url: /app/index.html` carried from ROADMAP override (CloudFront 403 fix), not re-litigated.
- Real-device offline cold-start (criterion 4) captured as human UAT, not an automatable check.

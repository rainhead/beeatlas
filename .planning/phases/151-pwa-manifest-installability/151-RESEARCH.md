# Phase 151: PWA Manifest & Installability - Research

**Researched:** 2026-06-19
**Domain:** PWA web app manifest, installability, Android `beforeinstallprompt`, iOS A2HS, icon assets
**Confidence:** HIGH (stack and wiring verified against repo; manifest/installability facts cross-checked against web.dev/Chrome docs)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** `start_url: /app/index.html` — NOT `/app` or `/app/`. CloudFront OAC returns 403 for trailing-slash/directory paths, so the installed PWA must launch the explicit `index.html` key. This OVERRIDES ARCHITECTURE §1c and REQUIREMENTS PWA-01 (both say `/app`). Chrome installability still satisfied: `/app/index.html` is within `scope: /app/`. **Do not "correct" this back to `/app`.**
- **D-02:** `scope: /app/`, `display: standalone`. `name: "Washington Bee Atlas"`, `short_name: "BeeAtlas"`.
- **D-03:** `theme_color` AND `background_color` BOTH = `#080d26` (the `--header-bg` navy `rgb(8,13,38)`). Splash is a dark navy field with the icon centered.
- **D-04:** Manifest linked only from `/app/index.html`, never from `/index.html` (no-PWA-on-`/` guarantee).
- **D-05:** No logo/icon exists in repo today. Generate a stylized **bee glyph on `--accent` green field (`#2c7a2c`)** — green reads brighter on a home screen than navy.
- **D-06:** **Single safe-zone design serves both `any` and `maskable`.** Bee sits within the maskable safe zone on a full-bleed green field; PNGs declared `purpose: "any maskable"` (or duplicate entries). Accepts the bee rendering slightly smaller in non-maskable contexts.
- **D-07:** Assets are **committed static files** (SVG master + 192/512/maskable-512 PNGs) in `public/app/icons/`, riding the `public/` → Vite `publicDir` passthrough like `public/app/sw.js`. An SVG→PNG repro script lives in the repo but is **NOT wired into the Eleventy/Vite build** (avoids adding an image dep to the bespoke `.11ty-vite` pipeline). Rejected `@vite-pwa/assets-generator`/`sharp`-at-build.
- **D-08:** A `/app` favicon may be derived from the same master (Claude's discretion; cheap once master exists).
- **D-09:** Capture `beforeinstallprompt` (`preventDefault()` + stash), surface a small **"Install" button in `<bee-header>`**, beside the cache icon + offline pill. Not a modal, not a banner. Clicking calls `prompt()` on the stashed event.
- **D-10:** Lifecycle: **show-while-installable, no manual dismiss.** Appears after `beforeinstallprompt`; disappears on `appinstalled` or when running standalone. No dismiss "x", no `localStorage` persistence.
- **D-11:** iOS Safari fires no `beforeinstallprompt`. Same header **"Install" button** (same label as Android) opens a **popover** (reuse cache-popover pattern) with Share-icon + "Add to Home Screen" steps.
- **D-12:** iOS button shown **only when iOS + Safari + not standalone** (UA detection + `navigator.standalone === false`). Hidden in iOS Chrome/Firefox. Self-clears once `navigator.standalone === true`.
- **D-13:** Manifest validity verified locally via Chrome DevTools → Application → Manifest, PLUS a `build-output.test.ts`-style assertion (`_site/app/manifest.webmanifest` exists, linked from `_site/app/index.html`, declares required keys + icon files exist).
- **D-14:** Offline cold-start in standalone (criterion 4 / PWA-03) is **real-device HUMAN UAT** — cannot be simulated. Real Android (Chrome install → airplane mode → launch) + real iOS (Share → A2HS → airplane mode → launch). Capture in `151-HUMAN-UAT.md`. Phase has `UI hint: yes`, must not auto-advance past UAT.
- **No infra change** — Phase 147 already added the `/app/manifest.webmanifest` no-cache CloudFront behavior.
- **Invariant:** no `skipWaiting` / `clientsClaim` (top-level).

### Claude's Discretion
- Exact bee glyph artwork, stroke weights, SVG→PNG generation script/tooling.
- Precise popover copy + Share-icon SVG for iOS instructions.
- Whether install/iOS logic is a new small component (`<bee-install>`) or folded into `<bee-header>`; exact event wiring for `beforeinstallprompt`/`appinstalled`.
- iOS-Safari detection implementation (UA sniff + `navigator.standalone`).
- The `/app` favicon (D-08) and exact `#080d26` color-format details.
- Test file placement/naming for the manifest assertion.

### Deferred Ideas (OUT OF SCOPE)
- Install-conversion analytics / tracking `beforeinstallprompt` outcome.
- Dismissible-with-persistence install prompt (rejected in favor of show-while-installable).
- Richer per-platform iOS instructions (iOS Chrome/Firefox variants).
- Separate `any` vs `maskable` icon designs (rejected in favor of single safe-zone design).
- `noindex`/robots hardening of `/app`.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PWA-01 | `/app/manifest.webmanifest` declares name, start_url, display:standalone, colors, 192/512/maskable icons; installable on Android via captured `beforeinstallprompt` surfaced as in-app "Install" affordance | §Standard Stack (no new deps), §Manifest Emission (recommend static file), §`beforeinstallprompt` Capture Pattern, §Maskable Icon Geometry |
| PWA-02 | iOS Safari (no `beforeinstallprompt`) shows "Add to Home Screen" instructions, only when not standalone | §iOS Detection & A2HS Popover, §iOS Meta Tags |
| PWA-03 | Installed app launched offline (cold start) opens standalone and renders map+table from cache | §Installability Gotchas (SW fetch handler already present — Phases 147–149), §Verification (human UAT per D-14) |
</phase_requirements>

## Summary

This phase is almost entirely **HTML/static-asset + small Lit-component work with zero new npm dependencies**. The SW machinery that makes offline cold-start work (precache + `NavigationRoute` + `/data/` CacheFirst) already shipped in Phases 147–149, and the CloudFront no-cache behavior for `/app/manifest.webmanifest` shipped in Phase 147. What remains: emit a real manifest, link it (plus iOS meta) from `_pages/app/index.html` only, commit a hand-built icon set, and add an "Install" affordance to `<bee-header>` driven by a captured `beforeinstallprompt` (Android) / UA-gated popover (iOS).

The central HOW question (Q1) resolves cleanly in favor of a **hand-authored static `public/app/manifest.webmanifest`**, riding the same `public/` passthrough as `public/app/sw.js`. Flipping VitePWA's `manifest` option to a config object is the wrong tool here: in `injectManifest` mode the `manifest` field has weak/uncertain emission semantics, it would emit `manifest.webmanifest` at site root (not under `/app/`) and inject its own `<link rel="manifest">` you don't control, and it directly contradicts D-07's "commit static assets, don't destabilize the bespoke build." A static file is deterministic, lands exactly at `/app/manifest.webmanifest` to match the Phase 147 CloudFront behavior, and is trivially assertable in `build-output.test.ts`.

The `<bee-header>` already has the exact reusable surface: `.icon-btn` chrome, the `.cache-icon-btn`/`.cache-popover` pattern, and the established `<bee-atlas>` state-owner → `<bee-header>` pure-presenter flow (window event → `@state` → `.property=` → CustomEvent back up). The install affordance should follow this pattern identically: `bee-atlas` owns `_installable` and `_iosInstructable` `@state`, passes them down as properties, and `<bee-header>` emits an `install-prompt` CustomEvent upward when the Android button is clicked.

**Primary recommendation:** Ship a hand-authored static `public/app/manifest.webmanifest` + committed `public/app/icons/{icon.svg,icon-192.png,icon-512.png,icon-maskable-512.png}` + a non-build-wired `scripts/gen-app-icons.sh` (using `rsvg-convert`, already on PATH). Add manifest `<link>` + iOS meta to `_pages/app/index.html` only. Capture `beforeinstallprompt` on `window` in a side-effect module imported from `app-entry.ts`, relay state through `bee-atlas` `@state` to a new "Install" button in `<bee-header>`. Extend `src/tests/build-output.test.ts` with manifest/icon/link assertions; offline cold-start stays human UAT.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Manifest emission | CDN / Static (`public/` passthrough → `/app/`) | — | Static asset; deterministic, matches Phase 147 CloudFront no-cache behavior keyed to `/app/manifest.webmanifest` |
| App icons | CDN / Static (`public/app/icons/`) | — | Committed PNGs/SVG ride passthrough like `sw.js`; fetched by OS at install/manifest-read time, not app-shell precache |
| `<link rel="manifest">` + iOS meta | Frontend Server (Eleventy template `_pages/app/index.html`) | — | HTML head; must be `/app`-only per D-04 |
| `beforeinstallprompt` capture | Browser / Client (window listener in side-effect module) | — | A window-level event; capture must be early and global, like `sw-registration.ts` |
| Install/iOS UI state ownership | Browser / Client (`<bee-atlas>` reactive state) | `<bee-header>` (presenter) | Architecture Invariant: `<bee-atlas>` owns state; header is a pure presenter |
| iOS Safari detection | Browser / Client | — | Runtime UA + `navigator.standalone` check; client-only |
| Offline cold-start (the thing installability exercises) | Browser / Client (SW from Phases 147–149) | — | Already shipped; this phase only confirms it via human UAT |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| (none new) | — | — | This phase ships HTML, static assets, and Lit-component code. No new runtime or build dependency. |

`vite-plugin-pwa@^1.3.0` is already installed and wired (`eleventy.config.js`); it is **not** used to emit the manifest (see §Manifest Emission). `lit` (already present) provides the `<bee-header>` component framework.

### Supporting (build-time, NOT app deps, NOT build-wired)
| Tool | Availability | Purpose | When to Use |
|------|-------------|---------|-------------|
| `rsvg-convert` | ✓ on PATH (`/opt/homebrew/bin/rsvg-convert`, librsvg) | SVG master → PNG at exact pixel sizes | One-off icon regen via a committed `scripts/gen-app-icons.sh`, run manually [VERIFIED: `command -v`] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Static `public/app/manifest.webmanifest` | VitePWA `manifest: { … }` config object | Rejected — in `injectManifest` mode, emits at site root not `/app/`, injects an uncontrolled `<link>`, and destabilizes the bespoke build (D-07). [CITED: vite-plugin-pwa docs; injectManifest is SW-source-focused] |
| `rsvg-convert` for SVG→PNG | `sharp` (npm), `@vite-pwa/assets-generator`, `inkscape`, `magick` | All work. `sharp`/assets-generator rejected by D-07 (no image dep in build). `inkscape`/`magick` also on PATH but heavier than `rsvg-convert`. Python (`cairosvg`/Pillow) NOT installed in `data/pyproject.toml` — avoid. |
| `"any maskable"` single string | Two separate icon entries | web.dev recommends separate files; **D-06 explicitly accepts the single-design tradeoff** — do not relitigate. `"any maskable"` is a valid purpose string. [CITED: web.dev/articles/maskable-icon] |

**Installation:** No `npm install`. Optionally verify `rsvg-convert` exists at icon-gen time (`command -v rsvg-convert`).

**Version verification:** `vite-plugin-pwa@1.3.0` confirmed in `package.json` [VERIFIED: package.json grep]. No package versions to add.

## Package Legitimacy Audit

> No external packages are installed in this phase. Audit is N/A.

| Package | Disposition |
|---------|-------------|
| (none) | No installs — phase is HTML/static-asset/component-only |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
Build time (npm run build):
  public/app/manifest.webmanifest ─┐
  public/app/icons/*.{svg,png}    ─┤  Vite publicDir passthrough
  public/app/sw.js (existing)     ─┘     (verbatim copy, no hashing)
                                          │
                                          ▼
                              _site/app/manifest.webmanifest
                              _site/app/icons/*
  _pages/app/index.html ──(Eleventy + Vite)──▶ _site/app/index.html
        │  contains <link rel="manifest" href="/app/manifest.webmanifest">
        │           + apple-mobile-web-app-* meta + apple-touch-icon
        ▼

Runtime (/app page in browser):
  app-entry.ts
    ├─ bee-atlas.ts        (state owner)
    ├─ sw-registration.ts  (existing — registers /app/sw.js)
    └─ install-prompt.ts   (NEW side-effect module)
            │
            │  window.addEventListener('beforeinstallprompt', e => {
            │     e.preventDefault(); stash(e);
            │     window.dispatchEvent(new CustomEvent('pwa-installable')) })
            │  window.addEventListener('appinstalled', …clear…)
            ▼
       <bee-atlas>  @state _installable, _iosInstructable
            │  .installable=  .iosInstructable=   (properties down)
            ▼
       <bee-header>  renders "Install" button when installable||iosInstructable
            │  Android: @click → dispatch 'install-prompt' (up) → bee-atlas calls stashedEvent.prompt()
            │  iOS:     @click → opens A2HS popover (reuse cache-popover pattern, local @state)
            ▼
   Android: native install dialog        iOS: Share→Add-to-Home-Screen instructions
```

File-to-implementation mapping is in §Integration Points below (from CONTEXT.md `<code_context>`).

### Recommended Project Structure (new/modified files only)
```
public/app/
├── manifest.webmanifest          # NEW — hand-authored static manifest
└── icons/
    ├── icon.svg                  # NEW — SVG master (bee glyph on #2c7a2c)
    ├── icon-192.png              # NEW — 192×192
    ├── icon-512.png              # NEW — 512×512
    └── icon-maskable-512.png     # NEW — 512×512 safe-zone variant (may equal icon-512 per D-06)
scripts/
└── gen-app-icons.sh              # NEW — rsvg-convert SVG→PNG; NOT build-wired
src/
├── install-prompt.ts             # NEW (or fold into existing module) — beforeinstallprompt capture
├── bee-header.ts                 # MODIFIED — Install button + iOS A2HS popover
├── bee-atlas.ts                  # MODIFIED — _installable/_iosInstructable @state + wiring
└── app-entry.ts                  # MODIFIED — import './install-prompt.ts'
_pages/app/index.html             # MODIFIED — <link rel="manifest"> + iOS meta + apple-touch-icon
src/tests/build-output.test.ts    # MODIFIED — manifest/icon/link assertions
```

### Pattern 1: State-owner → presenter relay (REUSE the existing offline/cache pattern verbatim)
**What:** A window-level signal is captured in a side-effect module, dispatched as a `CustomEvent` on `window`, listened for in `bee-atlas.connectedCallback`, stored in `@state`, passed down to `<bee-header>` as a `.property`, and the header emits a `CustomEvent` back up on user action.
**When to use:** Exactly this phase's install affordance — it mirrors how `_offline`, `_cacheState`, and `_updateAvailable` already flow.
**Example (the existing precedent to copy):**
```typescript
// Source: src/bee-atlas.ts (existing — _offline / sw-update-available flow)
// connectedCallback:
window.addEventListener('sw-update-available', this._onSwUpdateAvailable);
this.addEventListener('cache-update-acted', this._onBannerTap);
// @state:
@state() private _updateAvailable: boolean = false;
// render():
//   <bee-header .updateAvailable=${this._updateAvailable}></bee-header>
```
```typescript
// NEW install-prompt.ts (mirror sw-registration.ts side-effect style)
let stashed: BeforeInstallPromptEvent | null = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();                 // D-09 — suppress mini-infobar
  stashed = e as BeforeInstallPromptEvent;
  window.dispatchEvent(new CustomEvent('pwa-installable'));
});
window.addEventListener('appinstalled', () => {
  stashed = null;
  window.dispatchEvent(new CustomEvent('pwa-installed'));  // D-10 — clears button
});
// Expose prompt() for the bee-atlas click relay (window handoff like __wb in sw-registration.ts):
(window as Window & { __pwaPrompt?: () => Promise<void> }).__pwaPrompt = async () => {
  if (!stashed) return;
  await stashed.prompt();
  stashed = null;
  window.dispatchEvent(new CustomEvent('pwa-installed'));   // hide after choice (D-10)
};
```

### Pattern 2: iOS A2HS popover (REUSE the cache-popover machinery)
**What:** `<bee-header>` already implements an open/close popover with document-click + Escape dismiss (`_popoverOpen`, `_onDocumentClick`, `_onDocumentKeydown`, `.cache-popover` styles). The iOS instructions popover is a second instance of the same pattern with different content (Share-icon SVG + 3-step list).
**When to use:** D-11 iOS A2HS instructions.
**Note:** Keep popover open/close state local to `<bee-header>` (`@state`), as the cache popover already does — it does not need to live in `<bee-atlas>` because it's transient UI, not app state. Only `installable`/`iosInstructable` (whether the button shows) flows from `<bee-atlas>`.

### Anti-Patterns to Avoid
- **Linking the manifest from `/index.html`:** Violates D-04 and the Phase 147 no-PWA-on-`/` guarantee. Manifest `<link>` and iOS meta go in `_pages/app/index.html` ONLY.
- **Flipping VitePWA `manifest:` to a config object:** Wrong layer (emits at root, injects uncontrolled `<link>`, destabilizes build). See §Manifest Emission.
- **Putting `beforeinstallprompt` capture inside a Lit component's `connectedCallback`:** The event can fire before the component mounts. Capture at module/window level early (like `sw-registration.ts`), stash, and replay via CustomEvent — this is also why the existing `wb.addEventListener('waiting', …)` is attached before `register()`.
- **Calling top-level `skipWaiting()`/`clients.claim()`:** Hard invariant (Phase 147/149). Not touched by this phase, but do not introduce it.
- **Precaching the icon PNGs:** `globIgnores` already excludes `**/*.png`. Icons are fetched by the OS at install/manifest-read time, not app-shell assets — leave them out of precache (confirmed: Phase 148 `globIgnores: ['**/*.png', …]`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Manifest generation | A VitePWA manifest-config pipeline | A committed static `manifest.webmanifest` | Deterministic, matches CloudFront path, zero build fragility (D-07) |
| Popover open/close/dismiss | A new popover from scratch | The existing `.cache-popover` + `_onDocumentClick`/`_onDocumentKeydown` machinery in `bee-header.ts` | Already handles outside-click, Escape, ARIA, reduced-motion |
| State plumbing | Module-level mutable shared state | `<bee-atlas>` `@state` → `.property` → CustomEvent (existing pattern) | Architecture Invariant: no shared module-level mutable state; bee-atlas owns state |
| SVG→PNG rasterization | A Node sharp build step | `rsvg-convert` in a manually-run script | D-07 forbids image deps in the build; `rsvg-convert` is already on the dev machine |
| `BeforeInstallPromptEvent` type | A guessed interface | A minimal local `interface BeforeInstallPromptEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{outcome: 'accepted'|'dismissed'}> }` | TS lib.dom does not ship this type; a 3-line local interface is standard |

**Key insight:** Every piece of UI infrastructure this phase needs (icon-button chrome, popover, offline-pill conditional rendering, state relay) already exists in `<bee-header>`/`<bee-atlas>`. The work is composition and content, not new infrastructure.

## Manifest Emission (Q1 — the central HOW decision)

**Recommendation: hand-authored static `public/app/manifest.webmanifest`. HIGH confidence.**

Why NOT flip VitePWA `manifest: false` to a config object:
1. **Wrong output path.** vite-plugin-pwa emits `manifest.webmanifest` at the Vite outDir root (→ site root `/`), not under `/app/`. The Phase 147 CloudFront no-cache behavior is keyed to `/app/manifest.webmanifest`; a root-emitted file would miss it and would also violate the `/app`-scoping intent. [CITED: vite-plugin-pwa configuration docs]
2. **Uncontrolled `<link>` injection.** With a manifest config, vite-plugin-pwa injects its own `<link rel="manifest">` into HTML entry points it processes — you lose control over which page gets it (must be `/app` only, D-04) and the href.
3. **`injectManifest` strategy intent.** In `injectManifest` mode the plugin's job is SW-source bundling + precache injection; the `manifest` option's emission path is less battle-tested here than in `generateSW`. The current `manifest: false` line is deliberate (148 comment: "no webmanifest until Phase 151").
4. **D-07 principle.** "Commit static assets; don't add fragility to the bespoke `.11ty-vite` pipeline." A static file is the literal embodiment of D-07.

**The exact wiring:**
- Create `public/app/manifest.webmanifest` (static file). It rides `public/` → Vite `publicDir` passthrough exactly like `public/app/sw.js` → lands at `_site/app/manifest.webmanifest` → served at `/app/manifest.webmanifest`. [VERIFIED: eleventy.config.js publicDir comments + existing `public/app/sw.js` precedent]
- **Leave `manifest: false` in `eleventy.config.js` unchanged.** No VitePWA edit needed.
- Add `<link rel="manifest" href="/app/manifest.webmanifest">` to `_pages/app/index.html` head (D-04 — that file only).

**Manifest content (all fields locked by D-01/D-02/D-03/D-05/D-06):**
```json
{
  "name": "Washington Bee Atlas",
  "short_name": "BeeAtlas",
  "start_url": "/app/index.html",
  "scope": "/app/",
  "display": "standalone",
  "theme_color": "#080d26",
  "background_color": "#080d26",
  "icons": [
    { "src": "/app/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/app/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/app/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```
Note on D-06 ("declared as both any and maskable"): you may either (a) keep separate `any` and `maskable` entries as above (recommended for clarity — the maskable-512 can be the same safe-zone PNG), or (b) collapse to a single `"purpose": "any maskable"` entry. Both are valid manifests. The separate-entry form is clearer and still satisfies "single design serves both" because the maskable PNG is the safe-zone master and can double as the `any` icon. `#080d26` = `rgb(8,13,38)` confirmed [VERIFIED: `python3 -c "print('#%02x%02x%02x'%(8,13,38))"` → `#080d26`].

## iOS Meta Tags (Q2 — minimal correct set, `_pages/app/index.html` only)

iOS Safari does NOT read most manifest fields; standalone behavior and the home-screen icon still come from legacy `apple-*` meta tags. Add to `_pages/app/index.html` head (NEVER `_pages/index.html`):

```html
<link rel="manifest" href="/app/manifest.webmanifest" />
<!-- iOS standalone + status bar -->
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="BeeAtlas" />
<!-- iOS home-screen icon: 180×180, opaque (no transparency / no maskable) -->
<link rel="apple-touch-icon" href="/app/icons/apple-touch-icon-180.png" />
<!-- theme color for browser chrome (Android Chrome reads manifest; this is belt-and-suspenders) -->
<meta name="theme-color" content="#080d26" />
```

Notes:
- `apple-mobile-web-app-capable` is the iOS-standalone trigger (the modern `mobile-web-app-capable` is its Android/Chromium analogue, but Android uses the manifest `display`; you may add `<meta name="mobile-web-app-capable" content="yes">` harmlessly).
- `apple-mobile-web-app-status-bar-style: black-translucent` makes the status bar overlay the navy header — matches D-03 theme. `black` is the safer alternative if overlap is undesirable; pick during UAT.
- **`apple-touch-icon` should be a dedicated 180×180 opaque PNG** (Q5): iOS ignores manifest `maskable`/transparency and applies its own rounded-rect mask. Derive it from the same SVG master at 180px with the full green field (no transparency) — add `apple-touch-icon-180.png` to `public/app/icons/` and to `gen-app-icons.sh`. The existing `_pages/app/index.html` has `<link rel="icon" href="data:,">` (a no-op favicon) — keep or replace per D-08.

[CITED: developer.apple.com Safari HTML config; web.dev iOS A2HS guidance] — MEDIUM confidence (Apple's meta-tag docs are stable but sparsely updated; `apple-mobile-web-app-capable` remains the working trigger as of 2026).

## `beforeinstallprompt` Capture Pattern (Q3)

**Where to listen:** A `window` listener in a side-effect module (`src/install-prompt.ts`) imported from `app-entry.ts` — mirroring `sw-registration.ts`. NOT inside a component's `connectedCallback` (event may fire before mount).

**Why early:** Chrome may fire `beforeinstallprompt` during initial load. The existing code already demonstrates the "attach before the triggering action" discipline (`wb.addEventListener('waiting', …)` before `wb.register()`).

**State relay (respecting the Architecture Invariant):**
1. `install-prompt.ts` stashes the event, dispatches `window` CustomEvent `pwa-installable`.
2. `bee-atlas.connectedCallback` adds `window.addEventListener('pwa-installable', …)` and `('pwa-installed', …)` (alongside the existing `online`/`offline`/`sw-update-available` listeners), setting `@state _installable`.
3. `bee-atlas.render` passes `.installable=${this._installable}` to `<bee-header>`.
4. `<bee-header>` renders the Install button when `installable` is true; on click dispatches `install-prompt` CustomEvent up.
5. `bee-atlas` listens for `install-prompt`, calls `window.__pwaPrompt?.()` (the handoff exposed by `install-prompt.ts`, like the existing `window.__wb`).

**Clearing (D-10):**
- `appinstalled` → `install-prompt.ts` dispatches `pwa-installed` → `bee-atlas` sets `_installable = false`.
- Already-standalone at load → suppress the button: check `window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true` and never set `_installable`. Also listen to `matchMedia('(display-mode: standalone)').addEventListener('change', …)` to clear if the mode flips.

**TS type:** add a local `interface BeforeInstallPromptEvent extends Event { readonly platforms: string[]; prompt(): Promise<void>; readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }> }` — lib.dom does not ship it.

## iOS Detection & A2HS Popover (Q4)

**Goal (D-12):** show the iOS Install button only when **iOS + Safari + not standalone**.

**Least-bad reliable approach in 2026:**
```typescript
function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  // iPhone/iPod always report mobile UA. iPad in iPadOS desktop mode reports "Macintosh"
  // + touch — detect via maxTouchPoints. (UA-string OS version is frozen on iOS 26+, so
  // do NOT parse version.)
  const isIosDevice = /iPad|iPhone|iPod/.test(ua)
    || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints ?? 0) > 1);
  // Safari only: exclude Chrome(CriOS), Firefox(FxiOS), Edge(EdgiOS), and in-app webviews.
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|GSA|FBAN|FBAV|Instagram|Line/.test(ua);
  return isIosDevice && isSafari;
}
function showIosInstall(): boolean {
  return isIosSafari() && !isStandalone();
}
```

**Pitfalls (verified):**
- **iPadOS desktop-mode UA** reports as macOS Safari; the `MacIntel` + `maxTouchPoints > 1` heuristic is the standard disambiguator. [CITED: evilmartians, getupdraft on iPadOS UA freeze]
- **Frozen UA OS version on iOS/iPadOS 26+** — do NOT parse the iOS version number; gate only on device + Safari + standalone. [CITED: evilmartians 2026]
- **In-app browsers** (Instagram/Facebook/Line/Gmail `GSA`) contain `Safari` in some UAs but cannot A2HS the same way — exclude them (the negative list above). Accept that this list is best-effort; D-12 already scopes to "Safari-only" and defers non-Safari iOS variants.
- **`navigator.standalone`** is iOS-only (undefined elsewhere) — the `=== true` check is correct and the matchMedia fallback covers Android standalone.

This detection runs **at render time in `<bee-header>`** (or once in `bee-atlas` setting `_iosInstructable` @state). Because these are runtime-only checks (UA/standalone), they cannot be unit-tested against real iOS — a source-analysis test (string presence) is the most that's automatable (see §Verification).

**A2HS popover content:** reuse the cache-popover shell; content = a Share-icon SVG (iOS share glyph: square with upward arrow) + ordered steps: "1. Tap the Share button. 2. Scroll and tap 'Add to Home Screen'. 3. Tap 'Add'." Copy/SVG are Claude's discretion (D-11).

## Maskable Icon Geometry (Q5)

**Safe zone (verified):** keep all critical content (the bee) within a **centered circle of radius = 40% of icon width**, i.e. an 80%-diameter circle. The outer ~10% edge may be cropped on some platforms; design assuming the visible region is at most the central 80% square and ideally the central 80% circle. [CITED: web.dev/articles/maskable-icon]

Concrete for the 512 master: center the bee inside a circle of radius `0.40 × 512 = ~205px` (diameter ~410px) on a full-bleed `#2c7a2c` field. For 192: radius `~77px`.

**Declaring one PNG as both `any` and `maskable` (D-06):** two valid forms (see §Manifest Emission). `"purpose": "any maskable"` in a single entry is spec-valid; web.dev recommends separate files because a maskable icon used as `any` looks padded/small — **but D-06 explicitly accepts that compromise**, so either form is acceptable. Recommend separate entries (clearer, easier to assert), with the maskable-512 PNG = the safe-zone master.

**Separate apple-touch-icon (180px, opaque):** YES — recommended (Q5). iOS ignores `maskable`/transparency and masks `apple-touch-icon` itself with a rounded rect; supply a 180×180 opaque PNG (full green field, bee can be slightly larger than the maskable safe zone since iOS only rounds the corners). Add `apple-touch-icon-180.png`.

## SVG→PNG Generation (Q6)

**Recommendation: a committed `scripts/gen-app-icons.sh` using `rsvg-convert`, run manually, NOT build-wired. HIGH confidence.**

- `rsvg-convert` is already installed (`/opt/homebrew/bin/rsvg-convert`) [VERIFIED: `command -v`]. It rasterizes one SVG master to exact pixel sizes with crisp output and zero npm footprint — satisfying D-07's "no image dep in the `.11ty-vite` build."
- Python is NOT a viable path here: `data/pyproject.toml` does not list `cairosvg`/`Pillow`, and adding them couples icon-gen to the data pipeline's venv (wrong layer).
- `inkscape` and `magick` are also on PATH but heavier; `rsvg-convert` is the lowest-friction.

**Script shape (Claude's discretion on exact content):**
```bash
#!/usr/bin/env bash
# scripts/gen-app-icons.sh — regenerate /app PWA icons from the SVG master.
# NOT wired into the build (D-07). Run manually after editing icon.svg.
set -euo pipefail
SRC="public/app/icons/icon.svg"
OUT="public/app/icons"
command -v rsvg-convert >/dev/null || { echo "rsvg-convert required (brew install librsvg)"; exit 1; }
rsvg-convert -w 192 -h 192 "$SRC" -o "$OUT/icon-192.png"
rsvg-convert -w 512 -h 512 "$SRC" -o "$OUT/icon-512.png"
rsvg-convert -w 512 -h 512 "$SRC" -o "$OUT/icon-maskable-512.png"  # same safe-zone master (D-06)
rsvg-convert -w 180 -h 180 "$SRC" -o "$OUT/apple-touch-icon-180.png"
```
The PNGs are committed; the script is reproducibility insurance, not a build dependency. README/skill note: regenerate by running the script, not by hand-editing PNGs.

## Common Pitfalls

### Pitfall 1: Manifest emitted at site root instead of `/app/`
**What goes wrong:** Using VitePWA's `manifest` config object emits `/manifest.webmanifest`, missing the Phase 147 CloudFront no-cache behavior and breaking the `/app` scoping.
**Why it happens:** vite-plugin-pwa writes the manifest to the Vite outDir root.
**How to avoid:** Use a static `public/app/manifest.webmanifest` (rides the passthrough to `/app/`). Leave `manifest: false`.
**Warning signs:** `_site/manifest.webmanifest` exists but `_site/app/manifest.webmanifest` does not; DevTools shows manifest at wrong URL.

### Pitfall 2: `<link rel="manifest">` leaks onto `/`
**What goes wrong:** Adding the manifest link to a shared include/layout puts it on `/index.html`, violating the no-PWA-on-`/` guarantee (D-04).
**Why it happens:** `_pages/app/index.html` and `_pages/index.html` are separate templates; a careless edit to a shared head partial would hit both.
**How to avoid:** Edit `_pages/app/index.html` directly (it has its own full `<head>`, confirmed — not a shared layout). Assert in `build-output.test.ts` that `_site/index.html` does NOT contain `rel="manifest"`.
**Warning signs:** `grep -l 'rel="manifest"' _site/*.html` returns `_site/index.html`.

### Pitfall 3: Install button shows when already installed/standalone
**What goes wrong:** Button persists after install or on every standalone launch.
**Why it happens:** Not checking `display-mode: standalone` / `navigator.standalone` at startup; `appinstalled` not wired.
**How to avoid:** Gate `_installable`/`_iosInstructable` on `!isStandalone()` and clear on `appinstalled` (D-10/D-12).
**Warning signs:** Install button visible inside the installed app.

### Pitfall 4: `beforeinstallprompt` missed because listener attached too late
**What goes wrong:** Event fires during load before a component mounts; button never appears even though Chrome considers the app installable.
**Why it happens:** Listening in `connectedCallback` instead of at module/window scope.
**How to avoid:** Capture in the `install-prompt.ts` side-effect module imported early by `app-entry.ts`; stash + replay via CustomEvent.
**Warning signs:** Lighthouse says installable, but the Install button never renders.

### Pitfall 5: iPad reports as macOS and the iOS button never shows
**What goes wrong:** iPadOS desktop-mode UA is "Macintosh"; `/iPad/` regex misses it.
**Why it happens:** Apple defaults iPad Safari to desktop UA.
**How to avoid:** Add the `MacIntel` + `maxTouchPoints > 1` branch (see §iOS Detection).
**Warning signs:** iOS Install button absent on iPad in Safari.

## Code Examples

### Conditional Install button in `<bee-header>` render (compose into existing `.right-group`)
```typescript
// Source: pattern derived from existing bee-header.ts .right-group + .cache-icon-btn
// In render(), inside <div class="right-group"> before the cache button:
${this.installable ? html`
  <button class="icon-btn install-btn" @click=${this._onInstallClick}
          aria-label="Install app" title="Install app">
    ${this._installIcon()}  <!-- download/plus glyph -->
  </button>
` : this.iosInstructable ? html`
  <button class="icon-btn install-btn" @click=${this._toggleIosPopover}
          aria-haspopup="dialog" aria-expanded=${String(this._iosPopoverOpen)}
          aria-label="Add to Home Screen" title="Add to Home Screen">
    ${this._installIcon()}
  </button>
` : ''}
```
```typescript
// Android click → relay up (bee-atlas calls window.__pwaPrompt)
private _onInstallClick = () => {
  this.dispatchEvent(new CustomEvent('install-prompt', { bubbles: true, composed: true }));
};
```

### `build-output.test.ts` extension (D-13)
```typescript
// Source: extend src/tests/build-output.test.ts (existing post-build assertion gate)
test('emits _site/app/manifest.webmanifest with required keys (PWA-01, D-13)', () => {
  const m = JSON.parse(readFileSync(resolve(ROOT, '_site/app/manifest.webmanifest'), 'utf-8'));
  expect(m.name).toBe('Washington Bee Atlas');
  expect(m.short_name).toBe('BeeAtlas');
  expect(m.start_url).toBe('/app/index.html');     // D-01 — explicit, do not "fix"
  expect(m.scope).toBe('/app/');
  expect(m.display).toBe('standalone');
  expect(m.theme_color).toBe('#080d26');
  expect(m.background_color).toBe('#080d26');
  const sizes = m.icons.map((i: {sizes: string}) => i.sizes);
  expect(sizes).toContain('192x192');
  expect(sizes).toContain('512x512');
  expect(m.icons.some((i: {purpose?: string}) => (i.purpose ?? '').includes('maskable'))).toBe(true);
  for (const i of m.icons) {
    expect(existsSync(resolve(ROOT, '_site' + i.src)), `icon missing: ${i.src}`).toBe(true);
  }
});
test('_site/app/index.html links the manifest and apple-touch-icon (PWA-01, D-04)', () => {
  const html = readFileSync(resolve(ROOT, '_site/app/index.html'), 'utf-8');
  expect(html).toMatch(/<link[^>]+rel="manifest"[^>]+href="\/app\/manifest\.webmanifest"/);
  expect(html).toMatch(/apple-mobile-web-app-capable/);
  expect(html).toMatch(/rel="apple-touch-icon"/);
});
test('_site/index.html does NOT link a manifest (no-PWA-on-/ guarantee, D-04)', () => {
  const html = readFileSync(resolve(ROOT, '_site/index.html'), 'utf-8');
  expect(html).not.toMatch(/rel="manifest"/);
});
```

## Verification (Q7) — automatable vs human

| Item | Automatable? | How |
|------|-------------|-----|
| Manifest exists at `_site/app/manifest.webmanifest` | ✅ | `build-output.test.ts` `existsSync` |
| Manifest declares required keys (name/start_url/scope/display/colors/icons) | ✅ | `build-output.test.ts` JSON parse + asserts (D-13) |
| Icon files exist on disk at declared `src` | ✅ | `build-output.test.ts` loop over `m.icons` |
| Manifest linked from `_site/app/index.html` only | ✅ | regex on app index + negative assert on root index |
| iOS meta tags present on `/app` | ✅ | regex for `apple-mobile-web-app-capable`, `apple-touch-icon` |
| `beforeinstallprompt` captured + iOS gating logic present | ⚠️ partial | source-analysis test: assert `install-prompt.ts`/`bee-header.ts` contain `beforeinstallprompt`, `preventDefault`, `appinstalled`, `navigator.standalone`, `display-mode: standalone` strings (cannot exercise real events in jsdom) |
| Chrome installability (no manifest errors) | ❌ manual | DevTools → Application → Manifest on prod-build preview (D-13) |
| **Offline cold-start in standalone (PWA-03 / criterion 4)** | ❌ HUMAN UAT | Real Android + real iOS, airplane mode, per D-14 → `151-HUMAN-UAT.md` |

Test command: `npm test` (= `vitest run`); the build-output suite runs `npm run build` in `beforeAll` and can be skipped locally via `VITEST_SKIP_BUILD=1` (CI runs without it). [VERIFIED: package.json scripts + build-output.test.ts header]

## Installability Gotchas (Q8)

**Chrome installability checklist (2026) — current status against this repo:**
| Criterion | Status | Note |
|-----------|--------|------|
| Served over HTTPS | ✅ | CloudFront (prod); localhost for dev |
| Web app manifest linked | ⏳ this phase | `<link rel="manifest">` on `/app` |
| Manifest has `name`/`short_name` | ⏳ this phase | D-02 |
| Manifest `start_url` within scope | ✅ by design | `/app/index.html` ⊂ `/app/` (D-01) |
| Manifest `display: standalone` | ⏳ this phase | D-02 |
| Icons: 192 + 512 PNG | ⏳ this phase | D-05/D-06 |
| Registered SW **with a fetch handler** | ✅ already shipped | `src/sw.ts` has `NavigationRoute` + `/data/` `registerRoute` calls = fetch handler (Phases 147–149) [VERIFIED: sw.ts grep] |

[CITED: developer.chrome.com/blog/update-install-criteria; web.dev/articles/install-criteria]

**Does anything in the 147–150 SW setup block installability?**
- **No.** The SW has a fetch handler (`NavigationRoute` + runtime routes) — the install criterion is "registered SW with a fetch event handler," which is satisfied. [VERIFIED: sw.ts]
- The **no-`skipWaiting`/`clientsClaim`** invariant does NOT affect installability — those govern activation timing, not install eligibility. Leave it intact.
- `globIgnores` excluding `**/*.png` does NOT block installability — icons are fetched by the OS at install time from the manifest URLs, independent of the precache. Confirm the icon URLs are reachable (they will be, via the passthrough). [VERIFIED: eleventy.config.js globIgnores]
- The `/app/manifest.webmanifest` `no-cache` CloudFront behavior (Phase 147) is correct for installability (always-fresh manifest). No infra change needed (locked).

## Runtime State Inventory

> This is a feature-addition phase, not a rename/migration. Most categories are N/A; a few file/asset additions noted.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no datastore keys reference manifest/icons | None — verified: this phase adds static assets + UI, touches no DB |
| Live service config | CloudFront `/app/manifest.webmanifest` no-cache behavior already shipped in Phase 147 | None this phase (locked: no infra change) |
| OS-registered state | The installed PWA itself becomes OS-registered home-screen state on user devices (the *point* of the phase) | Tested via human UAT (D-14); no repo action |
| Secrets/env vars | None | None — verified: no new env vars |
| Build artifacts | New committed static assets (`public/app/manifest.webmanifest`, `public/app/icons/*`) ride the existing passthrough; no stale-artifact risk | Ensure `gen-app-icons.sh` output is committed; not build-wired |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `rsvg-convert` (librsvg) | One-off SVG→PNG icon gen (`gen-app-icons.sh`) | ✓ | librsvg (Homebrew) | `inkscape` or `magick` (both on PATH); or hand-export PNGs |
| `vite-plugin-pwa` | Already-wired SW build (NOT manifest) | ✓ | 1.3.0 | — |
| Node | Build/test | ✓ | 24.12 (`.nvmrc`) | — |
| Real Android device (Chrome) | PWA-03 human UAT | (human) | — | None — required for criterion 4 |
| Real iOS device (Safari) | PWA-02/PWA-03 human UAT | (human) | — | None — required for criterion 4 |

**Missing dependencies with no fallback:** Real Android + iOS devices for the offline cold-start UAT (D-14) — inherent to the phase, not a blocker for the code work.
**Missing dependencies with fallback:** None for code/asset work — `rsvg-convert` is present and has alternatives.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (`vitest run`) |
| Config file | `vitest.config.ts` / inline (existing — `src/tests/*` discovered) |
| Quick run command | `VITEST_SKIP_BUILD=1 npm test` (skips the 180s build in build-output suite) |
| Full suite command | `npm test` (runs `npm run build` in build-output `beforeAll`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PWA-01 | Manifest emitted with required keys + icons at `/app/` | post-build assertion | `npm test` (build-output.test.ts manifest tests) | ✅ extend existing |
| PWA-01 | Manifest linked from `/app` only, not `/` | post-build assertion | `npm test` | ✅ extend existing |
| PWA-01 | `beforeinstallprompt` captured (preventDefault + stash + appinstalled) | source-analysis | `npm test` (grep `install-prompt.ts` strings) | ⚠️ Wave 0 (new test) |
| PWA-02 | iOS gating strings present (Safari + standalone checks) | source-analysis | `npm test` | ⚠️ Wave 0 (new test) |
| PWA-02 | iOS meta tags on `/app` | post-build assertion | `npm test` | ✅ extend existing |
| PWA-03 | Offline cold-start standalone renders map+table | **manual / human UAT** | — (real device, airplane mode) | ❌ human-only (D-14) |

### Sampling Rate
- **Per task commit:** `VITEST_SKIP_BUILD=1 npm test` (fast; component/source tests)
- **Per wave merge:** `npm test` (full, includes build-output manifest assertions)
- **Phase gate:** Full suite green + Chrome DevTools manifest check + `151-HUMAN-UAT.md` passed before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] Extend `src/tests/build-output.test.ts` — manifest exists/keys/icons + link-on-`/app`-only + no-link-on-`/` (covers PWA-01)
- [ ] New source-analysis test (e.g. `src/tests/install-affordance.test.ts`) — asserts `beforeinstallprompt`/`preventDefault`/`appinstalled` in `install-prompt.ts` and iOS gating strings in `bee-header.ts` (covers PWA-01/PWA-02 logic presence)
- [ ] `151-HUMAN-UAT.md` scaffold for the real-device offline cold-start checklist (PWA-03)
- Framework install: none — Vitest already configured.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `mobile-web-app-capable` only | iOS still needs `apple-mobile-web-app-capable`; Chromium uses manifest `display` | stable | Must include both legacy `apple-*` meta AND manifest for cross-platform |
| Parse iOS version from UA | UA OS version frozen on iOS/iPadOS 26+ | iOS 26 (2025) | Do NOT version-sniff; gate on device + Safari + standalone only |
| `/iPad/` UA detection | iPad reports macOS UA in desktop mode → use `MacIntel` + `maxTouchPoints` | iPadOS 13+ | iPad detection requires the touch-points heuristic |

**Deprecated/outdated:**
- ARCHITECTURE §1c `start_url: /app` — superseded by ROADMAP/D-01 `start_url: /app/index.html` (CloudFront OAC 403). Do not follow §1c on this point.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `apple-mobile-web-app-capable` remains the working iOS-standalone trigger in 2026 | iOS Meta Tags | LOW — well-established; verify visually during iOS UAT (D-14 already requires real-device check) |
| A2 | `apple-mobile-web-app-status-bar-style: black-translucent` gives the desired navy-overlay status bar | iOS Meta Tags | LOW — cosmetic; swap to `black` during UAT if overlap looks wrong |
| A3 | The in-app-browser exclusion list (CriOS/FxiOS/GSA/FBAN/etc.) is sufficient for D-12's Safari-only gate | iOS Detection | LOW — best-effort by design; D-12 scopes to Safari and defers non-Safari iOS |

**Note:** No package or compliance assumptions — phase adds no dependencies. All manifest/installability facts are CITED to web.dev/Chrome/Apple docs or VERIFIED against the repo.

## Open Questions

1. **Single `"any maskable"` entry vs separate `any`/`maskable` entries (D-06 says "declared as both").**
   - What we know: both are spec-valid; web.dev prefers separate files; D-06 accepts the single-design tradeoff.
   - What's unclear: which form the planner/implementer prefers for the manifest JSON.
   - Recommendation: separate entries (clearer + easier to assert), maskable-512 PNG = the safe-zone master, optionally reused as the 512 `any` icon. Either form passes installability.

2. **`<bee-install>` component vs folding into `<bee-header>` (Claude's discretion, D-09 note).**
   - What we know: the popover + button infra already lives in `<bee-header>`; the install logic is small.
   - Recommendation: fold the button + iOS popover into `<bee-header>` (reuse its popover machinery); keep the `beforeinstallprompt` capture in a separate side-effect module `install-prompt.ts`. A new component adds wiring for little gain.

3. **Status-bar style choice (`black` vs `black-translucent`).**
   - Resolve during iOS human UAT (D-14) — purely visual.

## Sources

### Primary (HIGH confidence)
- Repo files (VERIFIED): `eleventy.config.js`, `src/sw.ts`, `src/bee-header.ts`, `src/bee-atlas.ts`, `src/app-entry.ts`, `src/sw-registration.ts`, `src/tests/build-output.test.ts`, `package.json`, `.nvmrc`, `_pages/app/index.html`, `src/index.css`
- web.dev/articles/maskable-icon — maskable safe-zone radius (40% of width), `purpose` declaration guidance
- developer.chrome.com/blog/update-install-criteria + web.dev/articles/install-criteria — Chrome installability checklist (manifest fields, SW with fetch handler)

### Secondary (MEDIUM confidence)
- developer.apple.com Safari HTML config / web.dev iOS A2HS — `apple-mobile-web-app-*` meta tags, apple-touch-icon
- evilmartians.com (How to detect Safari and iOS versions, 2026); getupdraft.com (iPadOS breaking changes) — iPadOS desktop-mode UA + frozen-version detection

### Tertiary (LOW confidence)
- General 2026 PWA icon-size cheat-sheets (cross-checked against web.dev; only the web.dev geometry used as authoritative)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps; existing wiring read directly from repo
- Manifest emission decision (Q1): HIGH — grounded in repo's `public/` passthrough precedent + Phase 147/148 constraints
- iOS meta/detection (Q2/Q4): MEDIUM — Apple meta tags stable but sparsely documented; UA detection is inherently best-effort (D-12 acknowledges)
- Icon geometry (Q5): HIGH — web.dev authoritative
- Pitfalls: HIGH — derived from repo invariants + verified Chrome/Apple docs

**Research date:** 2026-06-19
**Valid until:** ~2026-07-19 (stable domain; re-check iOS UA detection if iOS 27 ships)

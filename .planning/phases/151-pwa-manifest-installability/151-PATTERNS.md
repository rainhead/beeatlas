# Phase 151: PWA Manifest & Installability - Pattern Map

**Mapped:** 2026-06-19
**Files analyzed:** 10 (5 new, 5 modified)
**Analogs found:** 9 / 10 (1 has no in-repo analog — the static `manifest.webmanifest`, sourced from RESEARCH §Manifest Emission instead)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `public/app/manifest.webmanifest` (NEW) | config (static asset) | file-I/O (build passthrough) | RESEARCH §Manifest Emission JSON + `public/` passthrough (no in-repo `.webmanifest`) | no-analog (literal content in RESEARCH) |
| `public/app/icons/*.{svg,png}` (NEW) | config (static asset) | file-I/O (build passthrough) | `public/data/*` passthrough precedent (publicDir) | role-match (passthrough mechanism only) |
| `scripts/gen-app-icons.sh` (NEW) | utility (build tooling, NOT build-wired) | batch / transform (SVG→PNG) | RESEARCH §SVG→PNG script shape (no in-repo shell-script analog) | no-analog (literal content in RESEARCH) |
| `src/install-prompt.ts` (NEW) | provider (window-level side-effect module) | event-driven | `src/sw-registration.ts` | exact |
| `src/tests/install-affordance.test.ts` (NEW) | test (source-analysis) | request-response (read-and-assert) | `src/tests/arch.test.ts` (read TS, regex-assert strings) | role-match |
| `_pages/app/index.html` (MOD) | route (Eleventy template head) | request-response | self (current head) + RESEARCH §iOS Meta Tags | exact (extend existing) |
| `src/bee-header.ts` (MOD) | component (presenter) | event-driven | self — `.cache-icon-btn` + `.cache-popover` machinery | exact (in-file analog) |
| `src/bee-atlas.ts` (MOD) | component (state owner) | event-driven | self — `_updateAvailable` / `_offline` relay flow | exact (in-file analog) |
| `src/app-entry.ts` (MOD) | provider (entry side-effect imports) | event-driven | self — `import './sw-registration.ts'` line | exact (in-file analog) |
| `src/tests/build-output.test.ts` (MOD) | test (post-build assertion) | file-I/O (read `_site/`) | self — Phase 147/148/149 `_site/app/*` assertions | exact (extend existing) |

## Pattern Assignments

### `src/install-prompt.ts` (provider, event-driven) — NEW

**Analog:** `src/sw-registration.ts` (the canonical early window-level side-effect module).

**Module shape to copy** (`src/sw-registration.ts:1-12, 44`): a leading doc comment stating "Imported ONLY by src/app-entry.ts"; listeners attached at module top-level; the side-effect fires via a bare call at the bottom (`registerServiceWorker();`). Not exported — keeps the no-SW-on-`/` structural guarantee. Mirror this: `install-prompt.ts` attaches `window.addEventListener('beforeinstallprompt'/'appinstalled', …)` at module scope and runs immediately on import.

**Cross-module window handoff to copy** (`src/sw-registration.ts:35`):
```typescript
(window as Window & { __wb?: Workbox }).__wb = wb;
```
Mirror this exactly for the prompt handoff — RESEARCH §Pattern 1 names it `window.__pwaPrompt`. `bee-atlas` invokes it the same way the update-banner tap-handler invokes `__wb` (`src/bee-atlas.ts:826`):
```typescript
const wb = (window as Window & { __wb?: { messageSkipWaiting(): void } }).__wb;
wb?.messageSkipWaiting();
```

**Attach-before-trigger discipline** (`src/sw-registration.ts:25-31`): `wb.addEventListener('waiting', …)` is attached BEFORE `wb.register()` so a fast transition is not missed. Same reason `beforeinstallprompt` must be captured at module scope, not in a component `connectedCallback` (RESEARCH Pitfall 4). On capture, dispatch a `window` CustomEvent (mirror `sw-registration.ts:27`):
```typescript
window.dispatchEvent(new CustomEvent('sw-update-available', { bubbles: true, composed: true }));
```
New events: `pwa-installable` (on `beforeinstallprompt` after `e.preventDefault()` + stash) and `pwa-installed` (on `appinstalled` or after `prompt()` resolves).

**TS type:** lib.dom does not ship `BeforeInstallPromptEvent` — declare the 3-line local interface from RESEARCH §Don't Hand-Roll.

---

### `src/bee-atlas.ts` (state owner, event-driven) — MOD

**Analog:** the in-file `_updateAvailable` / `_offline` relay (the exact precedent to mirror for `_installable` / `_iosInstructable`).

**@state declaration** (`src/bee-atlas.ts:73, 76`):
```typescript
@state() private _offline: boolean = !navigator.onLine;
@state() private _updateAvailable: boolean = false;
```
Add `_installable` and `_iosInstructable` the same way. Gate `_installable`'s initial value on `!isStandalone()` (RESEARCH §beforeinstallprompt Clearing); set `_iosInstructable` from the iOS-Safari detection (RESEARCH §iOS Detection).

**window listener registration** (`src/bee-atlas.ts:437-444` in `connectedCallback`):
```typescript
window.addEventListener('online', this._onOnline);
window.addEventListener('offline', this._onOffline);
window.addEventListener('sw-update-available', this._onSwUpdateAvailable);
this.addEventListener('cache-popover-toggle', this._onPopoverToggle);
this.addEventListener('cache-update-acted', this._onBannerTap);
```
Add `window.addEventListener('pwa-installable', …)`, `window.addEventListener('pwa-installed', …)`, and `this.addEventListener('install-prompt', …)`. Mirror the removal block in `disconnectedCallback` (`src/bee-atlas.ts:457-459`).

**handler shape** (`src/bee-atlas.ts:793-794, 816`):
```typescript
private _onOnline = () => { this._offline = false; void this._refreshFreshness(); };
private _onSwUpdateAvailable = () => { this._updateAvailable = true; };
```
Add `_onPwaInstallable = () => { this._installable = true; }`, `_onPwaInstalled = () => { this._installable = false; }`. The `install-prompt` handler calls `window.__pwaPrompt?.()` (modeled on the `__wb` invocation at `src/bee-atlas.ts:826`).

**property pass-down** (`src/bee-atlas.ts:239-246`):
```typescript
<bee-header
  .offline=${this._offline}
  .updateAvailable=${this._updateAvailable}
></bee-header>
```
Add `.installable=${this._installable}` and `.iosInstructable=${this._iosInstructable}`.

---

### `src/bee-header.ts` (presenter, event-driven) — MOD

**Analog:** self — the `.cache-icon-btn` button + `.cache-popover` popover machinery (LOCKED reuse mandate, UI-SPEC §Reuse mandate).

**@property declarations to add** (`src/bee-header.ts:6-11`):
```typescript
@property({ attribute: false }) offline = false;
@property({ attribute: false }) updateAvailable: boolean = false;
```
Add `installable = false` and `iosInstructable = false` in the same block.

**Button chrome to reuse** — `.icon-btn` (`src/bee-header.ts:61-85`, 44px tap target, opacity 0.6→0.9 ladder) and `.cache-icon-btn:focus-visible` (`src/bee-header.ts:135-138`):
```css
.cache-icon-btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
```
The Install button is `.icon-btn install-btn`, icon-only, `currentColor` white, gaining only the green focus ring (UI-SPEC §Color — accent is NOT a fill).

**Conditional render slot** — place the Install button inside `.right-group` (`src/bee-header.ts:453-473`), BEFORE the `.cache-icon-btn`, after the offline pill (UI-SPEC §Placement → `[Offline pill?] [Install] [Cache] [GitHub]`). Mirror the existing conditional-button IIFE pattern at `src/bee-header.ts:455-472`. Android branch dispatches up (mirror the `cache-update-acted` dispatch at `src/bee-header.ts:303-308`):
```typescript
this.dispatchEvent(new CustomEvent('cache-update-acted', { composed: true, bubbles: true }));
```
→ new `install-prompt` CustomEvent (`bubbles: true, composed: true`).

**Inline SVG house style** (`src/bee-header.ts:331-355`): `viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" fill="none" aria-hidden="true"`, rounded caps/joins. The Install glyph (down-arrow-into-tray) and iOS Share glyph follow this verbatim (UI-SPEC §Install glyph). Must be visually distinct from the priming cloud-download glyph at `src/bee-header.ts:350-354`.

**iOS A2HS popover** — clone the `.cache-popover` shell (`src/bee-header.ts:158-243` styles; `src/bee-header.ts:371-422` render). Reuse the dismiss machinery VERBATIM:
- `_onDocumentClick` (`src/bee-header.ts:277-290`) — outside-click dismiss via `e.composedPath()`.
- `_onDocumentKeydown` (`src/bee-header.ts:292-301`) — Escape dismiss.
- `connectedCallback`/`disconnectedCallback` document listener add/remove (`src/bee-header.ts:245-255`).
- `_popoverOpen` `@state` toggle pattern (`src/bee-header.ts:13, 257-265`) — add a sibling `_iosPopoverOpen @state`.
- popover ARIA: `role="dialog" aria-modal="false"` + `.cache-popover__header` with a 44px `✕` `.cache-popover__dismiss` (`src/bee-header.ts:394-402`).
- popover rows: `.cache-popover__row` (14px) for steps, `.cache-popover__row--meta` (12px, `--text-hint`) for the optional sub-note (`src/bee-header.ts:207-216`).

Popover open/close state stays LOCAL to `<bee-header>` (`@state`) — it is transient UI, not app state (RESEARCH §Pattern 2). Only `installable`/`iosInstructable` flow down from `<bee-atlas>`.

---

### `src/app-entry.ts` (provider, event-driven) — MOD

**Analog:** self (`src/app-entry.ts:9-11`):
```typescript
import './bee-atlas.ts';
import './sw-registration.ts';
import './prime-orchestrator.ts';
```
Add `import './install-prompt.ts';` as a side-effect import. Do NOT add it to `_pages/index.html`'s entry (`src/bee-atlas.ts`) — that separation is the no-PWA-on-`/` guarantee.

---

### `_pages/app/index.html` (route, request-response) — MOD

**Analog:** self (current `<head>`, `_pages/app/index.html:6-13`) — a standalone full head, NOT a shared layout (Pitfall 2). Add into the head (RESEARCH §iOS Meta Tags), `/app` only:
```html
<link rel="manifest" href="/app/manifest.webmanifest" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<meta name="apple-mobile-web-app-title" content="BeeAtlas" />
<link rel="apple-touch-icon" href="/app/icons/apple-touch-icon-180.png" />
<meta name="theme-color" content="#080d26" />
```
The existing `<link rel="icon" href="data:,">` (`_pages/app/index.html:10`) is a no-op favicon — keep or replace per D-08. NEVER edit `_pages/index.html`.

---

### `public/app/manifest.webmanifest` + `public/app/icons/*` (config, file-I/O) — NEW

**Analog:** No in-repo `.webmanifest` exists. **Passthrough mechanism analog:** `public/` → Vite `publicDir` → `_site/` root (`eleventy.config.js:121-126`; `vite.config.ts:9-12` — do NOT set `publicDir: false`). `public/app/` is a NEW directory (currently `public/` holds only `data/`); files placed there land at `_site/app/...` and serve at `/app/...`, matching the Phase 147 CloudFront no-cache behavior keyed to `/app/manifest.webmanifest`. **Leave `eleventy.config.js:103 `manifest: false`` UNCHANGED** (RESEARCH §Manifest Emission — do not flip VitePWA's manifest option).

**Manifest content:** verbatim from RESEARCH §Manifest Emission (`151-RESEARCH.md:248-263`). `start_url: /app/index.html` is LOCKED (D-01 — do NOT "correct" to `/app`). Colors `#080d26` (= `rgb(8,13,38)`, `--header-bg`). Icons table in UI-SPEC §App icons.

**Icon geometry:** maskable safe zone = centered circle r = 40% of width (RESEARCH §Maskable Icon Geometry). `apple-touch-icon-180.png` is opaque (no transparency).

---

### `scripts/gen-app-icons.sh` (utility, transform) — NEW, NOT build-wired

**Analog:** No in-repo shell-script analog. Content verbatim from RESEARCH §SVG→PNG Generation (`151-RESEARCH.md:363-375`). Uses `rsvg-convert` (on PATH). NOT wired into Eleventy/Vite (D-07). PNGs are committed; the script is reproducibility insurance.

---

### `src/tests/install-affordance.test.ts` (test, source-analysis) — NEW

**Analog:** `src/tests/arch.test.ts` — reads `.ts` source via `readFileSync` and asserts string/import presence (jsdom cannot exercise real `beforeinstallprompt`/iOS events). Copy its `ROOT`/`readFileSync` setup (`src/tests/arch.test.ts:11-16`). Assert: `install-prompt.ts` contains `beforeinstallprompt`, `preventDefault`, `appinstalled`; `bee-header.ts` / `bee-atlas.ts` contain `navigator.standalone`, `display-mode: standalone`, the iOS-Safari UA strings (RESEARCH §Verification, Wave 0). NOTE the test-mounting caveat (memory `feedback_bee_atlas_test_mounting`) — prefer pure source-string assertions over mounting `<bee-atlas>`.

---

### `src/tests/build-output.test.ts` (test, post-build) — MOD

**Analog:** self — the Phase 147/148/149 `_site/app/*` assertion blocks (`src/tests/build-output.test.ts:305-393`). Copy the `existsSync(resolve(ROOT, '_site/app/sw.js'))` style (`:320-322`) and the `readFileSync` + `toMatch` HTML-link style (`:311-318`). Add the three tests verbatim from RESEARCH §Code Examples (`151-RESEARCH.md:439-465`): manifest keys/icons exist, `/app/index.html` links manifest + apple-touch-icon, `/index.html` does NOT link a manifest. Suite runs `npm run build` in `beforeAll` (`:17-19`); skippable via `VITEST_SKIP_BUILD=1`.

## Shared Patterns

### State-owner → presenter relay
**Source:** `src/bee-atlas.ts:73-76` (@state) + `:239-246` (pass-down) + `:437-444` (listeners) → `src/bee-header.ts:6-11` (@property) + `:303-308` (dispatch up).
**Apply to:** `_installable` / `_iosInstructable` wiring.
```typescript
// down:  <bee-header .installable=${this._installable}>
// up:    this.dispatchEvent(new CustomEvent('install-prompt', { bubbles: true, composed: true }));
```
Architecture Invariant (CLAUDE.md): `<bee-atlas>` owns state; `<bee-header>` is a pure presenter. No module-level mutable state — the window handoff (`__pwaPrompt`) is a function reference, mirroring the existing `__wb`.

### Early window-level side-effect capture
**Source:** `src/sw-registration.ts` (whole file) + `src/app-entry.ts:9-11`.
**Apply to:** `install-prompt.ts`. Capture at module scope, stash, replay via `window` CustomEvent. Import as a side-effect from `app-entry.ts` only (never the `/` entry).

### Popover open/close/dismiss machinery
**Source:** `src/bee-header.ts:158-243` (styles), `:245-301` (document click + Escape + lifecycle), `:371-422` (render shell).
**Apply to:** the iOS A2HS popover. Reuse verbatim with `role="dialog" aria-modal="false"`, 44px `✕` dismiss, outside-click + Escape. Add a sibling `_iosPopoverOpen @state`.

### Inline SVG house style
**Source:** `src/bee-header.ts:331-355` (cache icons) + the nav icons `:432-451`.
**Apply to:** Install glyph + iOS Share glyph. `viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" fill="none" aria-hidden="true"`, rounded caps/joins.

### Brand tokens (no hardcoding)
**Source:** `src/index.css` `:root` — `--header-bg: rgb(8,13,38)` (= `#080d26`), `--accent: #2c7a2c`.
**Apply to:** manifest colors (D-03), icon green field (D-05), focus ring. The manifest is static JSON so it carries literal `#080d26` (the one allowed duplication; build-output test asserts the value).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `public/app/manifest.webmanifest` | config | file-I/O | No `.webmanifest` exists in repo. Content is fully specified in `151-RESEARCH.md:248-263`; mechanism analog is the `public/` → publicDir passthrough. |
| `scripts/gen-app-icons.sh` | utility | transform | No shell-script analog in repo. Content specified in `151-RESEARCH.md:363-375`. |

## Metadata

**Analog search scope:** `src/` (components, side-effect modules, tests), `src/tests/`, `_pages/app/`, `eleventy.config.js`, `vite.config.ts`, `public/`.
**Files scanned:** `src/bee-header.ts`, `src/bee-atlas.ts`, `src/sw-registration.ts`, `src/app-entry.ts`, `src/tests/build-output.test.ts`, `src/tests/arch.test.ts`, `_pages/app/index.html`, `eleventy.config.js`, `vite.config.ts`.
**Pattern extraction date:** 2026-06-19

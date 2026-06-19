// Captures the browser's beforeinstallprompt event and exposes __pwaPrompt for callers.
// Imported ONLY by src/app-entry.ts.
// _pages/index.html -> src/bee-atlas.ts never imports this file,
// guaranteeing / has no PWA install affordance (structural, not runtime).
//
// Phase 151-03 (D-09, D-10): captures beforeinstallprompt early (module scope, not
// connectedCallback — RESEARCH Pitfall 4), suppresses the mini-infobar via preventDefault,
// dispatches pwa-installable to signal <bee-atlas>. On appinstalled (or after prompt()
// resolves), dispatches pwa-installed to clear the install button (D-10).

// lib.dom does not ship BeforeInstallPromptEvent — declare the local interface here.
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

// Module-scope stash — must be at module scope (RESEARCH Pitfall 4: beforeinstallprompt
// can fire before any component mounts, so connectedCallback capture would miss it).
let _stashed: BeforeInstallPromptEvent | null = null;

// D-09: capture beforeinstallprompt, prevent the mini-infobar, stash for later prompt().
window.addEventListener('beforeinstallprompt', (e: Event) => {
  e.preventDefault();
  _stashed = e as BeforeInstallPromptEvent;
  window.dispatchEvent(new CustomEvent('pwa-installable'));
});

// D-10: appinstalled fires when the PWA is installed via any means (native dialog, Safari
// A2HS). Clear stash and dispatch pwa-installed to clear the Install button.
window.addEventListener('appinstalled', () => {
  _stashed = null;
  window.dispatchEvent(new CustomEvent('pwa-installed'));
});

// Cross-module handoff to the install-prompt handler in <bee-atlas>, which calls
// window.__pwaPrompt?.() on the install-prompt CustomEvent (mirrors the __wb handoff
// in sw-registration.ts:35 / usage in bee-atlas.ts:826).
(window as Window & { __pwaPrompt?: () => Promise<void> }).__pwaPrompt = async () => {
  if (!_stashed) return;
  await _stashed.prompt();
  _stashed = null;
  window.dispatchEvent(new CustomEvent('pwa-installed'));
};

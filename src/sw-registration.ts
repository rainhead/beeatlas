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

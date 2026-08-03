/**
 * diagnostics.ts — an on-device state dump, because the phone has no console.
 *
 * WHY THIS EXISTS. Every failure in the offline/basemap area is silent, and the
 * one place they all show up — a real iOS device, installed to the Home Screen,
 * in airplane mode — is the one place a console is hardest to attach to. Safari's
 * Web Inspector needs a cable, a Mac, two settings toggled on two devices, and the
 * app frontmost; when it does not cooperate there is no fallback and a bug report
 * degrades to "the map was blank".
 *
 * So: open any /app URL with `?diag=1` and the app runs as normal with a
 * screenshot-able report pinned over it. One screenshot answers the questions that
 * would otherwise take a round trip each — is it installed, is storage persisted,
 * are the archives actually there and how big, did the real style load or the
 * blank fallback, is the service worker controlling this page, is the MapLibre
 * worker reachable.
 *
 * Deliberately dependency-free and defensive: it must produce a report even when
 * the thing being diagnosed is broken. Every probe is individually try/caught, so
 * one failure yields one "ERR" line rather than an empty panel.
 */

const PARAM = 'diag';

/** Bytes as a short human string; the report is read on a phone screen. */
function mb(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

async function probe(label: string, fn: () => Promise<string> | string): Promise<string> {
  try {
    return `${label}: ${await fn()}`;
  } catch (err) {
    return `${label}: ERR ${err instanceof Error ? err.message : String(err)}`;
  }
}

/** The map, if <bee-map> has mounted. Reached defensively — it may not exist. */
function mapInstance(): { getStyle?: () => { layers?: unknown[]; sources?: Record<string, { url?: string }> }; isSourceLoaded?: (id: string) => boolean } | null {
  try {
    const atlas = document.querySelector('bee-atlas') as (HTMLElement & { shadowRoot: ShadowRoot }) | null;
    const beeMap = atlas?.shadowRoot?.querySelector('bee-map') as (HTMLElement & { _map?: never }) | null;
    return (beeMap as unknown as { _map?: never })?._map ?? null;
  } catch {
    return null;
  }
}

export async function collectDiagnostics(): Promise<string> {
  const lines: string[] = [];
  const add = (s: string) => lines.push(s);

  add(`BeeAtlas diagnostics · ${new Date().toISOString()}`);
  add('');

  // --- Environment. Installed-vs-tab is the single most consequential bit: the
  // two have SEPARATE storage buckets, so a download made in the wrong one is
  // invisible here (ADR 0025).
  add('— environment —');
  add(await probe('url', () => location.href));
  add(await probe('online', () => String(navigator.onLine)));
  add(await probe('installed (standalone)', () => {
    const ios = (navigator as { standalone?: boolean }).standalone === true;
    const dm = matchMedia('(display-mode: standalone)').matches;
    return `${ios || dm}  (navigator.standalone=${ios}, display-mode=${dm})`;
  }));
  add(await probe('storage persisted', async () =>
    String(await navigator.storage?.persisted?.() ?? 'unsupported')));
  add(await probe('storage estimate', async () => {
    const e = await navigator.storage?.estimate?.();
    return e ? `${mb(e.usage ?? 0)} used of ${mb(e.quota ?? 0)}` : 'unsupported';
  }));
  add('');

  // --- Service worker. If this page is uncontrolled, nothing precached is
  // reachable and every offline symptom follows from that one fact.
  add('— service worker —');
  add(await probe('controlled', () => String(!!navigator.serviceWorker?.controller)));
  add(await probe('registrations', async () => {
    const regs = await navigator.serviceWorker?.getRegistrations?.() ?? [];
    return regs.length === 0 ? 'NONE' :
      regs.map((r) => `${r.scope} [${r.active?.state ?? 'no active'}]`).join(', ');
  }));
  add('');

  // --- Caches. Counts and bytes per bucket, then the archives spelled out,
  // because "primed" is exactly the claim that keeps turning out to be wrong.
  add('— caches —');
  add(await probe('buckets', async () => {
    const names = await caches.keys();
    if (names.length === 0) return 'NONE';
    const parts: string[] = [];
    for (const n of names) parts.push(`\n    ${n}: ${(await (await caches.open(n)).keys()).length} entries`);
    return parts.join('');
  }));
  add(await probe('basemap archives', async () => {
    const c = await caches.open('basemap-archives');
    const keys = await c.keys();
    if (keys.length === 0) return 'EMPTY — nothing primed, or it was evicted';
    const parts: string[] = [];
    for (const r of keys) {
      const resp = await c.match(r);
      const size = resp ? (await resp.blob()).size : 0;
      parts.push(`\n    ${r.url.split('/').pop()} = ${mb(size)}`);
    }
    return parts.join('');
  }));
  add(await probe('basemap manifest (cached)', async () => {
    const hit = await caches.match('/basemap/tiles/manifest.json', { cacheName: 'basemap-manifest' });
    if (!hit) return 'ABSENT — offline there is no archive name to load';
    const m = await hit.json() as { regions?: Record<string, { archive?: string; terrain?: { archive?: string } }> };
    const wa = m.regions?.['wa'];
    return `vector=${wa?.archive ?? '?'} terrain=${wa?.terrain?.archive ?? 'none'}`;
  }));
  add('');

  // --- The renderer. These are served by the SW, and only work because they sit
  // inside its /app/ scope; a worker outside it is unreachable offline however
  // thoroughly it was precached.
  add('— renderer reachability —');
  for (const url of [
    '/app/basemap/maplibre/maplibre-gl-worker.mjs',
    '/app/basemap/maplibre/maplibre-gl-shared.mjs',
    '/basemap/fonts/Noto Sans Medium/0-255.pbf',
    '/basemap/sprites/light.json',
  ]) {
    add(await probe(`  ${url.split('/').slice(-2).join('/')}`, async () => {
      const r = await fetch(url);
      return `${r.status}${r.ok ? '' : ' ← MISSING'}`;
    }));
  }
  add('');

  // --- The map. "Blank fallback vs real style" is the difference between a
  // missing manifest and a missing archive, and it is invisible from the outside.
  add('— map —');
  const m = mapInstance();
  if (!m) {
    add('map: NOT MOUNTED');
  } else {
    add(await probe('style layers', () => {
      const n = m.getStyle?.()?.layers?.length ?? 0;
      return `${n}${n <= 2 ? '  ← BLANK FALLBACK (no basemap style)' : ''}`;
    }));
    add(await probe('pmtiles sources', () => {
      const src = m.getStyle?.()?.sources ?? {};
      const entries = Object.entries(src).filter(([, v]) => typeof v?.url === 'string' && v.url.startsWith('pmtiles://'));
      if (entries.length === 0) return 'NONE — the style names no archive';
      return entries.map(([k, v]) => `\n    ${k}: ${v.url?.split('/').pop()} loaded=${m.isSourceLoaded?.(k)}`).join('');
    }));
  }
  add('');
  add(await probe('userAgent', () => navigator.userAgent));

  return lines.join('\n');
}

/**
 * Open the panel now. This is the path that matters: an installed PWA has no
 * address bar, so `?diag=1` cannot be typed on the device where the offline
 * failures actually happen — and a link tapped from Safari opens in Safari's
 * SEPARATE storage bucket, which reports the wrong state entirely. The account
 * menu's Diagnostics row calls this.
 *
 * `delayMs` exists only for the URL-parameter path, where the map has not
 * resolved a style yet; opened from the menu the app is already up.
 */
export function openDiagnostics(delayMs = 0): void {
  const render = async (pre: HTMLPreElement) => {
    pre.textContent = 'collecting…';
    pre.textContent = await collectDiagnostics();
  };

  const mount = () => {
    if (document.querySelector('[data-beeatlas-diagnostics]')) return;
    const host = document.createElement('div');
    host.setAttribute('data-beeatlas-diagnostics', '');
    host.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:2147483647',
      'background:rgba(255,255,255,0.97)', 'color:#111',
      'font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace',
      'padding:1rem', 'overflow:auto', '-webkit-overflow-scrolling:touch',
      'overscroll-behavior:contain',
    ].join(';');

    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;gap:.5rem;margin-bottom:.75rem;position:sticky;top:0;background:inherit;padding-bottom:.5rem';
    const pre = document.createElement('pre');
    pre.style.cssText = 'white-space:pre-wrap;word-break:break-word;margin:0';

    const button = (label: string, onClick: () => void) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = 'font:inherit;padding:.4rem .7rem;border:1px solid #999;border-radius:4px;background:#fff';
      b.addEventListener('click', onClick);
      return b;
    };
    bar.append(
      button('Refresh', () => void render(pre)),
      // A phone screenshot is the normal way this gets reported, but copying is
      // better when it fits: the text is searchable and nothing is cropped.
      button('Copy', () => { void navigator.clipboard?.writeText(pre.textContent ?? ''); }),
      button('Close', () => host.remove()),
    );
    host.append(bar, pre);
    document.body.appendChild(host);

    if (delayMs > 0) setTimeout(() => void render(pre), delayMs);
    else void render(pre);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    mount();
  }
}

/**
 * The `?diag=1` entry point. Kept for desktop and for the dev server, where an
 * address bar exists; on an installed app use the account menu instead.
 *
 * The delay is so the map section is populated: <bee-map> resolves its style
 * asynchronously, and that section is the most useful part of the report.
 */
export function installDiagnosticsPanel(): void {
  try {
    if (new URLSearchParams(location.search).get(PARAM) !== '1') return;
  } catch {
    return;
  }
  openDiagnostics(4000);
}

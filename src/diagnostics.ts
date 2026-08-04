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
 * So: open the app with `?diag=1` and it runs as normal with a
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

import { archiveReadStats } from './basemap-cache.ts';
import { netAttempts, browserLoadedResources } from './net-log.ts';
import { loadLastKnownIdentity } from './auth-client.ts';

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

/** The <bee-map> element, if mounted. Reached defensively — it may not exist. */
function beeMapElement(): HTMLElement | null {
  try {
    const atlas = document.querySelector('bee-atlas') as (HTMLElement & { shadowRoot: ShadowRoot }) | null;
    return (atlas?.shadowRoot?.querySelector('bee-map') as HTMLElement | null) ?? null;
  } catch {
    return null;
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
  // beeatlas-1dc: the LOCAL half of identity only — read straight out of
  // storage, never a whoami call, because this panel exists for the device that
  // cannot reach the network. "who does this device think you are" is now a
  // distinct question from "who does the server say you are", and only the
  // first one is answerable here.
  add(await probe('last known identity', () => {
    const known = loadLastKnownIdentity();
    return known.authenticated ? `${known.login} (unverified; role=${known.role ?? 'none'})` : 'none';
  }));
  add('');

  // --- Service worker. If this page is uncontrolled, nothing precached is
  // reachable and every offline symptom follows from that one fact.
  add('— service worker —');
  // The controller is THIS CLIENT's view of its worker, and it is the reading to
  // trust: a controlled client whose fetches complete has a worker that is
  // dispatching events. `registration.active.state` is a separate object and, on
  // iOS 18.7 / Safari 26.6, was observed reporting `activating` indefinitely for a
  // worker that was demonstrably serving. Print both so a disagreement is visible
  // rather than alarming.
  add(await probe('controlled', () => {
    const c = navigator.serviceWorker?.controller;
    return c ? `true (controller state=${c.state})` : 'false';
  }));
  // One sample cannot answer the question a transitional state raises. A reading
  // of `activating` means either "caught mid-transition" — the ordinary case,
  // over in about a second — or "stuck", which is a different and much worse
  // thing: functional events queue behind activation, so a worker that never
  // finishes takes the app down for that user. The panel reported the first and
  // let the reader guess, which is exactly the shape of every other silent
  // failure in this area.
  //
  // So: when the first reading is transitional, look again. Only then — the
  // steady state is `activated` and must stay instant.
  add(await probe('registrations', async () => {
    const read = async () => (await navigator.serviceWorker?.getRegistrations?.() ?? [])
      .map((r) => ({
        scope: r.scope,
        // All three slots, not just `active`. During an update the interesting
        // worker is often the one in `installing` or `waiting`, and reporting
        // only the active one made an update in flight look like nothing.
        state: r.active?.state ?? 'no active',
        pending: [
          r.installing ? `installing:${r.installing.state}` : null,
          r.waiting ? `waiting:${r.waiting.state}` : null,
        ].filter(Boolean).join(' '),
      }));
    const TRANSITIONAL = ['installing', 'installed', 'activating'];

    const first = await read();
    if (first.length === 0) return 'NONE';
    if (!first.some((r) => TRANSITIONAL.includes(r.state)) ) {
      return first.map((r) => `${r.scope} [${r.state}]${r.pending ? ` ${r.pending}` : ''}`).join(', ');
    }

    await new Promise((res) => setTimeout(res, 2000));
    const again = await read();

    // A state that has not moved is only alarming if the worker is ALSO not
    // working, and this client can tell: while its active worker is `activating`,
    // the spec holds every fetch event it dispatches. So a controlled page that
    // has completed fetches — this report is full of them — has a worker that
    // activated, whatever `registration.active.state` says.
    //
    // Observed on iOS 18.7 / Safari 26.6: `activating` reported indefinitely for a
    // worker serving a 31-entry precache perfectly. Reporting that as "may be
    // STUCK" was a false alarm on the one platform this panel exists for, which is
    // worse than the ambiguity it replaced.
    const controlled = !!navigator.serviceWorker?.controller;
    return first.map((r, i) => {
      const now = again[i];
      if (now && now.state !== r.state) {
        return `${r.scope} [${r.state} → ${now.state}]${now.pending ? ` ${now.pending}` : ''}`;
      }
      const stuck = TRANSITIONAL.includes(r.state);
      const verdict = !stuck ? `${r.state} — UNCHANGED after 2s`
        : controlled
          ? `${r.state} — unchanged after 2s, but this page is CONTROLLED and its fetches ` +
            'complete, so the worker is dispatching events and has activated; some ' +
            'browsers do not update this value on the page-side object'
          : `${r.state} — UNCHANGED after 2s and this page is NOT controlled — genuinely STUCK`;
      return `${r.scope} [${verdict}]${now?.pending ? ` ${now.pending}` : ''}`;
    }).join(', ');
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
  // inside its scope; a worker outside it is unreachable offline however
  // thoroughly it was precached.
  add('— renderer reachability —');
  // maplibre-gl-shared.mjs is deliberately NOT here: the worker is bundled into
  // one self-contained file now, so probing the old sibling both reports a
  // failure that is correct-but-meaningless AND fires a doomed network request —
  // which on iOS raises the system "Turn On Wi-Fi" alert. A diagnostic must not
  // create the symptom it is diagnosing.
  for (const url of [
    '/basemap/maplibre/maplibre-gl-worker.mjs',
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
    // Read failures are the difference between "the archive is missing" and "the
    // archive is there but reads are dropping" — the second looks like holes in
    // the map that move as you zoom, and is otherwise completely silent.
    add(await probe('archive reads', () => {
      const s = archiveReadStats;
      const hung = s.reads - s.completed;
      return `${s.reads} started, ${s.completed} completed, ${s.retries} retried, ${s.failures} failed` +
        `\n    slowest ${s.maxMs.toFixed(0)} ms, total ${s.totalMs.toFixed(0)} ms` +
        (hung > 0 ? `\n    ${hung} NEVER RETURNED ← the read path is stalled, not the renderer` : '');
    }));
    // map.loaded() is false while ANY source still has tiles in flight, so it
    // separates "still working" from "gave up".
    add(await probe('map state', () => {
      const mm = m as unknown as { loaded?: () => boolean; isStyleLoaded?: () => boolean };
      return `loaded=${mm.loaded?.()} styleLoaded=${mm.isStyleLoaded?.()}`;
    }));
    // Everything that renders — vector tile parsing, GeoJSON clustering, symbol
    // layout — happens on MapLibre's worker. If it cannot start, tiles AND the
    // purely-local occurrence layer both render nothing, which is exactly the
    // shape of this failure. The page CAN fetch the worker file (see above), but
    // that proves nothing: a dedicated worker is a separate service-worker
    // client, matched on its own URL. This actually spawns one.
    add(await probe('maplibre worker spawns', () => new Promise<string>((res) => {
      const url = '/basemap/maplibre/maplibre-gl-worker.mjs';
      const t = setTimeout(() => res('yes (no message, as expected)'), 4000);
      try {
        const w = new Worker(url, { type: 'module' });
        w.onerror = (e) => { clearTimeout(t); w.terminate(); res(`NO — ${(e as ErrorEvent).message || 'opaque error'}`); };
        w.onmessage = () => { clearTimeout(t); w.terminate(); res('yes'); };
      } catch (err) {
        clearTimeout(t);
        res(`NO — threw ${err instanceof Error ? err.message : String(err)}`);
      }
    })));
    // Distinguishes "no dots because the data never loaded" from "no dots
    // because the layers are missing" from "no dots because there are none here".
    add(await probe('occurrences', () => {
      const bm = beeMapElement() as unknown as { _fullGeoJSON?: { features?: unknown[] } } | null;
      const feats = bm?._fullGeoJSON?.features?.length;
      const mm = m as unknown as {
        getLayer?: (id: string) => unknown;
        queryRenderedFeatures?: (o: { layers: string[] }) => unknown[];
      };
      const layer = !!mm.getLayer?.('unclustered-point');
      let rendered = 'n/a';
      try {
        const dots = mm.queryRenderedFeatures?.({ layers: ['unclustered-point'] })?.length ?? 0;
        const clusters = mm.queryRenderedFeatures?.({ layers: ['clusters'] })?.length ?? 0;
        rendered = `${dots} dots + ${clusters} clusters on screen`;
      } catch { /* layer absent */ }
      return `${feats ?? 'NOT LOADED'} features; layers ${layer ? 'present' : 'MISSING'}; ${rendered}`;
    }));
  }
  add('');

  // --- Who actually touched the network. Recorded rather than reasoned about:
  // every previous round of this hunt eliminated one suspect by reading code and
  // the nag survived. On iOS each failed request can raise the system "Turn On
  // Wi-Fi" modal, so anything marked FAILED here is a candidate.
  add('— network attempts (app) —');
  add(await probe('fetch/xhr', () => {
    if (netAttempts.length === 0) return 'none';
    return netAttempts
      .map((a) => `\n    ${a.outcome === 'ok' ? '   ' : '>> '}${a.at}ms ${a.outcome}  ${a.url.replace(location.origin, '')}`)
      .join('');
  }));
  add(await probe('browser-loaded (suspect only)', () => {
    // Loads no JS initiated — the webmanifest, icons, images. A zero-byte
    // transfer AND zero-length body AND zero duration is the failure signature;
    // a cache hit reports a decoded size.
    const suspect = browserLoadedResources().filter((r) => r.suspect);
    return suspect.length === 0
      ? `none (${browserLoadedResources().length} resources seen)`
      : suspect.map((r) => `\n    ${r.kind}  ${r.url.replace(location.origin, '')}`).join('');
  }));
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

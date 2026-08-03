/**
 * net-log.ts — record every network request the app attempts (beeatlas-c8v).
 *
 * WHY. On iOS a failed request inside an installed PWA raises the system "Turn On
 * Wi-Fi to Use the Internet" modal. Offline that modal appears over a map that is
 * working perfectly, and finding what caused it has so far been guesswork: each
 * candidate was found by reading code, fixed, and the nag persisted. Guessing has
 * a poor record here — the last culprit (the webmanifest and icons) was invisible
 * to every probe precisely because the app never requests it.
 *
 * So instead of reasoning about who fetches what, this records it. The
 * diagnostics panel prints the list, and a device screenshot names the culprit
 * instead of eliminating one suspect per round trip.
 *
 * COVERAGE, stated honestly:
 *   - `fetch` and XMLHttpRequest from the PAGE: captured here.
 *   - Resources the BROWSER loads (the webmanifest, icons, <img>, CSS): NOT
 *     captured here — nothing in JS sees them. Resource Timing catches most, and
 *     diagnostics reads that separately.
 *   - Requests from a worker: NOT captured. Each realm has its own `fetch`, and
 *     the SQLite engine runs in an inline blob: worker. It is already cache-first
 *     for both its wasm and the database (src/sqlite-worker.ts).
 *
 * Imported FIRST by app-entry.ts, because module side effects run in import
 * order and some modules fetch as they initialise.
 */

export interface NetAttempt {
  url: string;
  /** 'ok' | an HTTP status | 'FAILED' when the request itself threw. */
  outcome: string;
  /** ms since page start, so the order tells you what triggered what. */
  at: number;
}

const MAX = 40;
export const netAttempts: NetAttempt[] = [];

function record(url: string, outcome: string): void {
  if (netAttempts.length >= MAX) return;
  netAttempts.push({ url, outcome, at: Math.round(performance.now()) });
}

let installed = false;

function installNetLog(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const originalFetch = window.fetch;
  window.fetch = function patchedFetch(this: unknown, ...args: Parameters<typeof fetch>) {
    let url = '';
    try {
      const input = args[0];
      url = typeof input === 'string' ? input
        : input instanceof URL ? input.href
        : (input as Request).url;
    } catch { url = '<unreadable>'; }
    return originalFetch.apply(this as never, args).then(
      (res) => { record(url, res.ok ? 'ok' : String(res.status)); return res; },
      (err: unknown) => {
        // The interesting case: a request that never got a response at all, which
        // is what raises the iOS modal.
        record(url, `FAILED ${err instanceof Error ? err.name : ''}`.trim());
        throw err;
      },
    );
  } as typeof fetch;

  // XHR too — nothing in the app uses it today, but a dependency might, and an
  // unexplained request is exactly what this exists to stop.
  const XHR = window.XMLHttpRequest;
  if (XHR) {
    const open = XHR.prototype.open;
    XHR.prototype.open = function patchedOpen(this: XMLHttpRequest, method: string, u: string | URL, ...rest: unknown[]) {
      const href = typeof u === 'string' ? u : u.href;
      this.addEventListener('load', () => record(href, `xhr ${this.status}`));
      this.addEventListener('error', () => record(href, 'xhr FAILED'));
      return (open as (...a: unknown[]) => void).call(this, method, u, ...rest);
    } as typeof XHR.prototype.open;
  }
}

/**
 * Resources the BROWSER fetched, from Resource Timing — the only visibility we
 * get into loads no JS initiated (the webmanifest, icons, images). A zero-byte
 * transfer with a zero-length body is the signature of a failure; a cache hit
 * reports a decoded size.
 */
export function browserLoadedResources(): Array<{ url: string; kind: string; suspect: boolean }> {
  try {
    return performance.getEntriesByType('resource').map((e) => {
      const r = e as PerformanceResourceTiming;
      return {
        url: r.name,
        kind: r.initiatorType,
        suspect: r.transferSize === 0 && r.decodedBodySize === 0 && r.duration === 0,
      };
    });
  } catch {
    return [];
  }
}

// Installed as a MODULE SIDE EFFECT, not by a call from app-entry. ES imports are
// hoisted: every imported module finishes evaluating before the first statement
// of the importer runs, so a call there would be installed after exactly the
// initialisation-time requests this exists to catch. Being first in app-entry's
// import list is what makes it first.
installNetLog();

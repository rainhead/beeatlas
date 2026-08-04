// The `registrations` line of the on-device diagnostics panel (src/diagnostics.ts).
//
// WHY THIS ONE LINE HAS A TEST. It is read on a phone, in airplane mode, by
// someone who cannot attach a console — so it has to be self-explaining, and the
// thing it most needs to explain is a TRANSITIONAL state. `activating` means
// either "caught mid-transition", which is over in about a second and is fine,
// or "stuck", which is not fine at all: functional events queue behind
// activation, so a worker that never finishes takes the whole site down for that
// user. One sample cannot tell those apart, and the panel used to print one
// sample and leave the reader guessing.
//
// The browser cannot pin this — catching a real worker mid-install is a race —
// so the registration is faked and the states are driven by hand.
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

// The panel's other probes fetch for real (the renderer-reachability checks hit
// /basemap/...). Unstubbed those open sockets against happy-dom's origin and
// spray ECONNRESET over the log of a green run — the same noise beeatlas-556
// removed elsewhere. A 404 keeps each probe on its existing "missing" path,
// minus the socket.
beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
});

type FakeWorker = { state: string } | null;

/** A registration whose worker states come from a script, one entry per read. */
function stubRegistrations(reads: Array<{ active?: FakeWorker; installing?: FakeWorker; waiting?: FakeWorker }>) {
  let i = 0;
  const getRegistrations = vi.fn(async () => {
    const r = reads[Math.min(i++, reads.length - 1)]!;
    return [{
      scope: 'https://beeatlas.net/',
      active: r.active ?? null,
      installing: r.installing ?? null,
      waiting: r.waiting ?? null,
    }];
  });
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { getRegistrations, controller: null },
    configurable: true,
  });
  return getRegistrations;
}

/** Just the registrations line out of the whole report. */
async function registrationsLine(): Promise<string> {
  const { collectDiagnostics } = await import('../diagnostics.ts');
  const report = await collectDiagnostics();
  return report.split('\n').find((l) => l.startsWith('registrations:')) ?? '(absent)';
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('diagnostics: the registrations line', () => {
  test('the steady state reads plainly, and is sampled ONCE', async () => {
    // The overwhelmingly common case. It must not pay the re-sample delay —
    // opening this panel is already slow enough on the device that needs it.
    const get = stubRegistrations([{ active: { state: 'activated' } }]);

    const line = await registrationsLine();

    expect(line).toBe('registrations: https://beeatlas.net/ [activated]');
    expect(get, 'the steady state must not be re-sampled').toHaveBeenCalledTimes(1);
  });

  test('a transitional state that resolves is reported as having MOVED', async () => {
    // This is what the maintainer saw after the ADR 0029 migration: `activating`
    // caught in the second between install and activated. The answer a reader
    // needs is "it moved", not the bare state.
    stubRegistrations([
      { active: { state: 'activating' } },
      { active: { state: 'activated' } },
    ]);

    const line = await registrationsLine();

    expect(line).toContain('activating → activated');
    expect(line, 'a worker that moved must not be called stuck').not.toContain('STUCK');
  });

  test('a transitional state that does NOT move says so, in those words', async () => {
    // The failure that matters. Silence here reads as health, which is how every
    // other bug in this area has presented.
    stubRegistrations([
      { active: { state: 'activating' } },
      { active: { state: 'activating' } },
    ]);

    const line = await registrationsLine();

    expect(line).toContain('UNCHANGED after 2s');
    expect(line).toContain('may be STUCK');
  });

  test('an update in flight is visible — installing and waiting, not just active', async () => {
    // Reporting only `active` made an update in progress look like nothing at
    // all, which is exactly when someone opens this panel.
    stubRegistrations([
      { active: { state: 'activated' }, waiting: { state: 'installed' } },
    ]);

    expect(await registrationsLine()).toContain('waiting:installed');
  });

  test('no registration at all is NONE, not an empty line', async () => {
    stubRegistrations([{}]);
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { getRegistrations: vi.fn(async () => []), controller: null },
      configurable: true,
    });

    expect(await registrationsLine()).toBe('registrations: NONE');
  });

  test('a browser that rejects getRegistrations yields one ERR line, not an empty panel', async () => {
    // Every probe is individually try/caught for this reason: the panel must
    // produce a report even when the thing being diagnosed is broken.
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { getRegistrations: vi.fn(async () => { throw new Error('denied'); }), controller: null },
      configurable: true,
    });

    const line = await registrationsLine();
    expect(line).toContain('ERR');
    expect(line).toContain('denied');
  });
});

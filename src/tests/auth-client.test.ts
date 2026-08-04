import { test, expect, describe, vi, beforeEach, afterEach } from 'vitest';

const ORIGINAL_LOCATION = window.location;

// beeatlas-1dc: fetchWhoami/signOut now write to localStorage, and these tests
// share one module instance — so a leftover identity from an earlier test would
// otherwise be replayed into the next one's network-failure path.
beforeEach(() => {
  localStorage.clear();
});

describe('auth-client: fetchWhoami', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('hits /auth/whoami with credentials:include and parses the JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ authenticated: true, login: 'someuser', role: 'author', is_author: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { fetchWhoami } = await import('../auth-client.ts');
    const state = await fetchWhoami();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls.at(0) ?? [];
    const [url, opts] = call;
    expect(String(url)).toContain('/auth/whoami');
    expect(opts).toMatchObject({ credentials: 'include' });
    expect(state).toEqual({ authenticated: true, verified: true, login: 'someuser', role: 'author', isAuthor: true, isCurator: false, iconUrl: null });
  });

  test('maps icon_url => iconUrl (avatar)', async () => {
    const icon = 'https://static.inaturalist.org/attachments/users/icons/728554/abc-medium.jpeg';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ authenticated: true, login: 'someuser', role: 'author', is_author: true, icon_url: icon }),
    }));
    const { fetchWhoami } = await import('../auth-client.ts');
    expect((await fetchWhoami()).iconUrl).toBe(icon);
  });

  test('role: curator => isCurator true (D-03)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ authenticated: true, login: 'curator1', role: 'curator', is_author: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { fetchWhoami } = await import('../auth-client.ts');
    const state = await fetchWhoami();

    expect(state.isCurator).toBe(true);
  });

  test('role: author => isCurator false (D-03)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ authenticated: true, login: 'author1', role: 'author', is_author: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { fetchWhoami } = await import('../auth-client.ts');
    const state = await fetchWhoami();

    expect(state.isCurator).toBe(false);
  });

  test('unauthenticated => isCurator falsy (D-03)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ authenticated: false }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { fetchWhoami } = await import('../auth-client.ts');
    const state = await fetchWhoami();

    expect(state.isCurator).toBeFalsy();
  });

  test('a rejected fetch with nothing remembered is unverified, not a signed-out claim', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    const { fetchWhoami } = await import('../auth-client.ts');
    const state = await fetchWhoami();

    expect(state).toEqual({ authenticated: false, verified: false });
  });

  test('an authoritative anonymous answer is verified', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ authenticated: false }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { fetchWhoami } = await import('../auth-client.ts');
    const state = await fetchWhoami();

    expect(state).toEqual({ authenticated: false, verified: true });
  });
});

// beeatlas-1dc: "signed out" and "could not ask" are different answers.
describe('auth-client: identity survives going offline', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function signInAs(login: string, role: string | null = 'author'): Promise<void> {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ authenticated: true, login, role, is_author: true, icon_url: null }),
    }));
    const { fetchWhoami } = await import('../auth-client.ts');
    await fetchWhoami();
  }

  test('a confirmed identity is remembered and replayed when the network fails', async () => {
    await signInAs('rainhead');

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const { fetchWhoami } = await import('../auth-client.ts');
    const state = await fetchWhoami();

    expect(state).toEqual({
      authenticated: true, verified: false, login: 'rainhead',
      role: 'author', isAuthor: true, isCurator: false, iconUrl: null,
    });
  });

  test('offline short-circuits the request and still reports the identity', async () => {
    await signInAs('rainhead', 'curator');

    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    const { fetchWhoami } = await import('../auth-client.ts');
    const state = await fetchWhoami();

    // The whole point of the short-circuit: no doomed request, hence no iOS
    // "Turn On Wi-Fi" modal — and the answer is still who you are.
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state).toMatchObject({ authenticated: true, verified: false, login: 'rainhead', isCurator: true });
  });

  test('a 5xx is "could not ask", not "signed out"', async () => {
    await signInAs('rainhead');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    const { fetchWhoami } = await import('../auth-client.ts');

    expect(await fetchWhoami()).toMatchObject({ authenticated: true, verified: false, login: 'rainhead' });
  });

  test('an authoritative anonymous answer forgets the remembered identity', async () => {
    await signInAs('rainhead');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ authenticated: false }),
    }));
    const { fetchWhoami, loadLastKnownIdentity } = await import('../auth-client.ts');
    await fetchWhoami();

    expect(loadLastKnownIdentity()).toEqual({ authenticated: false, verified: false });
  });

  test('loadLastKnownIdentity ignores a corrupt or login-less record', async () => {
    const { loadLastKnownIdentity, IDENTITY_STORAGE_KEY } = await import('../auth-client.ts');

    localStorage.setItem(IDENTITY_STORAGE_KEY, 'not json{');
    expect(loadLastKnownIdentity()).toEqual({ authenticated: false, verified: false });

    localStorage.setItem(IDENTITY_STORAGE_KEY, JSON.stringify({ role: 'author' }));
    expect(loadLastKnownIdentity()).toEqual({ authenticated: false, verified: false });
  });
});

describe('auth-client: startSignIn', () => {
  afterEach(() => {
    Object.defineProperty(window, 'location', { value: ORIGINAL_LOCATION, writable: true });
  });

  test('builds the /auth/login?return_to= URL with proper encoding', async () => {
    const locationStub = { href: '' };
    Object.defineProperty(window, 'location', { value: locationStub, writable: true });

    const { startSignIn } = await import('../auth-client.ts');
    startSignIn('https://beeatlas.net/species/foo?x=1&y=2');

    expect(locationStub.href).toContain('/auth/login?return_to=');
    expect(locationStub.href).toContain(encodeURIComponent('https://beeatlas.net/species/foo?x=1&y=2'));
  });
});

describe('auth-client: signOut', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('POSTs /auth/logout with credentials:include', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ logged_out: true }) });
    vi.stubGlobal('fetch', fetchMock);

    const { signOut } = await import('../auth-client.ts');
    await signOut();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const call = fetchMock.mock.calls.at(0) ?? [];
    const [url, opts] = call;
    expect(String(url)).toContain('/auth/logout');
    expect(opts).toMatchObject({ method: 'POST', credentials: 'include' });
  });

  test('resolves without throwing even if the fetch rejects', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    const { signOut } = await import('../auth-client.ts');
    await expect(signOut()).resolves.toBeUndefined();
  });

  // beeatlas-1dc: without these, signing out in the field would be undone by the
  // first successful whoami after reconnecting.
  test('forgets the remembered identity even when the logout POST fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ authenticated: true, login: 'rainhead', role: 'author', is_author: true }),
    }));
    const { fetchWhoami, signOut, loadLastKnownIdentity } = await import('../auth-client.ts');
    await fetchWhoami();

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    await signOut();

    expect(loadLastKnownIdentity()).toEqual({ authenticated: false, verified: false });
  });

  test('a sign-out taken offline is delivered on the next whoami, and holds until it is', async () => {
    const { signOut, fetchWhoami } = await import('../auth-client.ts');

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const offlineFetch = vi.fn();
    vi.stubGlobal('fetch', offlineFetch);
    await signOut();
    expect(offlineFetch).not.toHaveBeenCalled();

    // Back online, but the logout still cannot land: the answer stays "signed
    // out", never the live session the cookie would still report.
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('still down')));
    expect(await fetchWhoami()).toEqual({ authenticated: false, verified: false });

    // Once it lands, the answer is a verified signed-out — no whoami needed to
    // learn what we just did — and the retry does not repeat afterwards.
    const okFetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ logged_out: true }) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ authenticated: false }) });
    vi.stubGlobal('fetch', okFetch);
    expect(await fetchWhoami()).toEqual({ authenticated: false, verified: true });
    expect(String(okFetch.mock.calls[0]?.[0])).toContain('/auth/logout');

    expect(await fetchWhoami()).toEqual({ authenticated: false, verified: true });
    expect(okFetch).toHaveBeenCalledTimes(2);
    expect(String(okFetch.mock.calls[1]?.[0])).toContain('/auth/whoami');
  });

  test('signing in again retires a sign-out still waiting for the network', async () => {
    const locationStub = { href: '' };
    Object.defineProperty(window, 'location', { value: locationStub, writable: true });
    try {
      const { signOut, startSignIn, fetchWhoami } = await import('../auth-client.ts');

      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
      vi.stubGlobal('fetch', vi.fn());
      await signOut();

      startSignIn('https://beeatlas.net/');

      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ authenticated: true, login: 'rainhead', role: 'author', is_author: true }),
      });
      vi.stubGlobal('fetch', fetchMock);

      // No deferred logout is spent on the fresh session.
      expect(await fetchWhoami()).toMatchObject({ authenticated: true, verified: true, login: 'rainhead' });
      expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/auth/whoami');
    } finally {
      Object.defineProperty(window, 'location', { value: ORIGINAL_LOCATION, writable: true });
    }
  });
});

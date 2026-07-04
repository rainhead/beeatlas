import { test, expect, describe, vi, afterEach } from 'vitest';

const ORIGINAL_LOCATION = window.location;

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
    expect(state).toEqual({ authenticated: true, login: 'someuser', role: 'author', isAuthor: true });
  });

  test('returns {authenticated:false} on a rejected fetch', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    const { fetchWhoami } = await import('../auth-client.ts');
    const state = await fetchWhoami();

    expect(state).toEqual({ authenticated: false });
  });

  test('returns {authenticated:false} when the response is not authenticated', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ authenticated: false }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { fetchWhoami } = await import('../auth-client.ts');
    const state = await fetchWhoami();

    expect(state).toEqual({ authenticated: false });
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
});

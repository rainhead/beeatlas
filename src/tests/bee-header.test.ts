import { test, expect, describe, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Mock heavy modules that have module-level side effects incompatible with happy-dom
vi.mock('../sqlite.ts', () => ({
  getDB: vi.fn(() => Promise.resolve({ sqlite3: {}, db: 0 })),
  loadOccurrencesTable: vi.fn(() => Promise.resolve()),
  tablesReady: Promise.resolve(),
}));

vi.mock('../features.ts', () => ({
  loadOccurrenceGeoJSON: vi.fn(() => Promise.resolve({
    geojson: { type: 'FeatureCollection', features: [] },
    summary: { totalSpecimens: 0, speciesCount: 0, genusCount: 0, familyCount: 0, earliestYear: 0, latestYear: 0 },
    taxaOptions: [],
  })),
}));

describe('HDR: bee-header property interface', () => {
  // NOTE: Plan 109-02 removed viewMode property; bee-header no longer has view-switching buttons
  test('BeeHeader no longer has @property declaration for viewMode', async () => {
    const { BeeHeader } = await import('../bee-header.ts');
    const props = (BeeHeader as unknown as { elementProperties: Map<string, unknown> }).elementProperties;
    expect(props.has('viewMode')).toBe(false);
    expect(props.has('layerMode')).toBe(false);
  });

  test('BeeHeader is registered as bee-header custom element', async () => {
    await import('../bee-header.ts');
    const el = document.createElement('bee-header');
    expect(el.tagName.toLowerCase()).toBe('bee-header');
  });

  test('bee-header.ts does NOT contain layerMode, _onLayerClick, or layer-changed', () => {
    const src = readFileSync(resolve(__dirname, '../bee-header.ts'), 'utf-8');
    expect(src).not.toMatch(/layerMode/);
    expect(src).not.toMatch(/_onLayerClick/);
    expect(src).not.toMatch(/layer-changed/);
  });

  test('bee-header.ts does NOT contain viewMode, _onViewClick, or view-changed (Plan 109-02)', () => {
    const src = readFileSync(resolve(__dirname, '../bee-header.ts'), 'utf-8');
    expect(src).not.toMatch(/viewMode/);
    expect(src).not.toMatch(/_onViewClick/);
    expect(src).not.toMatch(/view-changed/);
  });
});

describe('HDR: bee-header event emission', () => {
  // NOTE: Plan 109-02 removed view-changed events; bee-header is now a static display element
  test('bee-header renders species index link', async () => {
    await import('../bee-header.ts');
    const el = document.createElement('bee-header') as any;
    document.body.appendChild(el);
    await el.updateComplete;

    const shadow = el.shadowRoot!;
    const speciesLink = shadow.querySelector('a[aria-label="Species index"]') as HTMLAnchorElement | null;
    expect(speciesLink).not.toBeNull();
    expect(speciesLink!.href).toContain('/species/');

    document.body.removeChild(el);
  });

  test('bee-header renders places link', async () => {
    await import('../bee-header.ts');
    const el = document.createElement('bee-header') as any;
    document.body.appendChild(el);
    await el.updateComplete;

    const shadow = el.shadowRoot!;
    const placesLink = shadow.querySelector('a[aria-label="Places"]') as HTMLAnchorElement | null;
    expect(placesLink).not.toBeNull();

    document.body.removeChild(el);
  });
});

describe('OFF-05: bee-header offline pill (Plan 149-03)', () => {
  let el: HTMLElement & { offline: boolean; updateComplete: Promise<boolean>; shadowRoot: ShadowRoot };

  afterEach(() => {
    if (el && el.isConnected) {
      el.remove();
    }
  });

  test('renders an Offline pill when offline=true (OFF-05)', async () => {
    await import('../bee-header.ts');
    el = document.createElement('bee-header') as any;
    (el as any).offline = true;
    document.body.appendChild(el);
    await (el as any).updateComplete;

    const pill = el.shadowRoot!.querySelector('.offline-pill');
    expect(pill).not.toBeNull();
    expect(pill!.textContent).toBe('Offline');
  });

  test('renders no pill when offline=false (OFF-05)', async () => {
    await import('../bee-header.ts');
    el = document.createElement('bee-header') as any;
    (el as any).offline = false;
    document.body.appendChild(el);
    await (el as any).updateComplete;

    const pill = el.shadowRoot!.querySelector('.offline-pill');
    expect(pill).toBeNull();
  });
});

describe('178-07: bee-header sign-in / whoami / sign-out (D-10)', () => {
  let el: HTMLElement & { authState: unknown; updateComplete: Promise<boolean>; shadowRoot: ShadowRoot };

  afterEach(() => {
    if (el && el.isConnected) {
      el.remove();
    }
  });

  // beeatlas-j96: sign-in is no longer a standalone header button — it is a row
  // inside the one account/status menu, which renders in both auth states.
  const _popoverSignIn = (el: { shadowRoot: ShadowRoot }): HTMLButtonElement =>
    [...el.shadowRoot.querySelectorAll('.account-popover button')]
      .find((b) => /sign in/i.test(b.textContent || '')) as HTMLButtonElement;

  const _openMenu = async (el: any) => {
    const btn = el.shadowRoot!.querySelector('.account-btn') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    btn.click();
    await el.updateComplete;
  };

  test('menu offers "Sign in with iNaturalist" when authState is null', async () => {
    await import('../bee-header.ts');
    el = document.createElement('bee-header') as any;
    document.body.appendChild(el);
    await el.updateComplete;
    await _openMenu(el);

    expect(_popoverSignIn(el)).not.toBeUndefined();
    expect(_popoverSignIn(el).textContent).toContain('Sign in with iNaturalist');
    expect(el.shadowRoot!.querySelector('.account-popover')!.textContent)
      .not.toMatch(/Sign out/i);
  });

  test('menu offers "Sign in with iNaturalist" when authState.authenticated is false', async () => {
    await import('../bee-header.ts');
    el = document.createElement('bee-header') as any;
    (el as any).authState = { authenticated: false };
    document.body.appendChild(el);
    await el.updateComplete;
    await _openMenu(el);

    expect(_popoverSignIn(el)).not.toBeUndefined();
  });

  test('dispatches a composed+bubbling sign-in event on click', async () => {
    await import('../bee-header.ts');
    el = document.createElement('bee-header') as any;
    document.body.appendChild(el);
    await el.updateComplete;
    await _openMenu(el);

    const handler = vi.fn();
    document.addEventListener('sign-in', handler);
    _popoverSignIn(el).click();
    document.removeEventListener('sign-in', handler);

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0]?.[0] as CustomEvent;
    expect(event.composed).toBe(true);
    expect(event.bubbles).toBe(true);
  });

  const _popoverSignOut = (el: { shadowRoot: ShadowRoot }): HTMLButtonElement =>
    [...el.shadowRoot.querySelectorAll('.account-popover button')]
      .find((b) => /sign out/i.test(b.textContent || '')) as HTMLButtonElement;

  test('shows an account button; its popover carries username + allowlisted badge + sign-out', async () => {
    await import('../bee-header.ts');
    el = document.createElement('bee-header') as any;
    (el as any).authState = { authenticated: true, login: 'someuser', role: 'author', isAuthor: true };
    document.body.appendChild(el);
    await el.updateComplete;

    const acct = el.shadowRoot!.querySelector('.account-btn') as HTMLButtonElement;
    expect(acct).not.toBeNull();
    expect(acct.getAttribute('aria-label')).toContain('someuser');
    expect(el.shadowRoot!.querySelector('.account-popover')).toBeNull();

    acct.click();
    await el.updateComplete;
    const popover = el.shadowRoot!.querySelector('.account-popover')!;
    expect(popover).not.toBeNull();
    expect(popover.textContent).toContain('someuser');
    const badge = popover.querySelector('.whoami-badge')!;
    expect(badge.textContent).toContain('Author');
    expect(badge.classList.contains('whoami-badge--author')).toBe(true);
    expect(_popoverSignOut(el)).toBeTruthy();
  });

  test('account popover shows "Not an editor" badge when authenticated but not allowlisted', async () => {
    await import('../bee-header.ts');
    el = document.createElement('bee-header') as any;
    (el as any).authState = { authenticated: true, login: 'guestuser', role: null, isAuthor: false };
    document.body.appendChild(el);
    await el.updateComplete;

    (el.shadowRoot!.querySelector('.account-btn') as HTMLButtonElement).click();
    await el.updateComplete;
    const badge = el.shadowRoot!.querySelector('.account-popover .whoami-badge')!;
    expect(badge).not.toBeNull();
    expect(badge.textContent).toContain('Not an editor');
    expect(badge.classList.contains('whoami-badge--guest')).toBe(true);
  });

  test('dispatches a composed+bubbling sign-out event from the account popover', async () => {
    await import('../bee-header.ts');
    el = document.createElement('bee-header') as any;
    (el as any).authState = { authenticated: true, login: 'someuser', role: 'author', isAuthor: true };
    document.body.appendChild(el);
    await el.updateComplete;

    (el.shadowRoot!.querySelector('.account-btn') as HTMLButtonElement).click();
    await el.updateComplete;

    const handler = vi.fn();
    document.addEventListener('sign-out', handler);
    _popoverSignOut(el).click();
    document.removeEventListener('sign-out', handler);

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0]?.[0] as CustomEvent;
    expect(event.composed).toBe(true);
    expect(event.bubbles).toBe(true);
  });
});

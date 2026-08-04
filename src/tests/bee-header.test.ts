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

  test('bee-header.ts does NOT contain viewMode, _onViewClick, or view-changed', () => {
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

describe('OFF-05: bee-header offline pill', () => {
  let el: HTMLElement & { offline: boolean; updateComplete: Promise<boolean>; shadowRoot: ShadowRoot };

  afterEach(() => {
    if (el && el.isConnected) {
      el.remove();
    }
  });

  test('renders an Offline pill when offline=true', async () => {
    await import('../bee-header.ts');
    el = document.createElement('bee-header') as any;
    (el as any).offline = true;
    document.body.appendChild(el);
    await (el as any).updateComplete;

    const pill = el.shadowRoot!.querySelector('.offline-pill');
    expect(pill).not.toBeNull();
    expect(pill!.textContent!.trim()).toBe('Offline');
    // The label is hidden below 640px so the header fits one row on a phone
    // (beeatlas-ax2), so the accessible name has to come from the element
    // itself rather than from the text — otherwise the pill becomes a
    // decorative icon announcing nothing on exactly the screens that hide it.
    expect(pill!.getAttribute('aria-label')).toBe('Offline');
    expect(pill!.getAttribute('role')).toBe('status');
    expect(pill!.querySelector('svg')).not.toBeNull();
  });

  test('renders no pill when offline=false', async () => {
    await import('../bee-header.ts');
    el = document.createElement('bee-header') as any;
    (el as any).offline = false;
    document.body.appendChild(el);
    await (el as any).updateComplete;

    const pill = el.shadowRoot!.querySelector('.offline-pill');
    expect(pill).toBeNull();
  });
});

// The install control moved out of the header and into the account menu, beside
// the offline UI it is the precondition for (an installed iOS PWA has its own
// storage bucket, beeatlas-93t). On a phone the header row is title + 4 nav icons
// + offline pill + search + account, and this was the sixth control.
describe('bee-header: installing is a row in the account menu, not a header button', () => {
  let el: any;
  afterEach(() => { if (el?.isConnected) el.remove(); });

  const mount = async (props: Record<string, unknown>) => {
    await import('../bee-header.ts');
    el = document.createElement('bee-header') as any;
    Object.assign(el, props);
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
  };
  const openMenu = async () => {
    (el.shadowRoot.querySelector('.account-btn') as HTMLButtonElement).click();
    await el.updateComplete;
  };
  const menuRow = (re: RegExp): HTMLButtonElement =>
    [...el.shadowRoot.querySelectorAll('.account-popover button')]
      .find((b: Element) => re.test(b.textContent || '')) as HTMLButtonElement;

  test('an installable app puts no button in the header', async () => {
    await mount({ installable: true });
    expect(el.shadowRoot.querySelector('.right-group .install-btn'),
      'the header must not grow the control back').toBeNull();
  });

  test('the Install row is in the menu and dispatches install-prompt', async () => {
    await mount({ installable: true });
    await openMenu();
    const row = menuRow(/install app/i);
    expect(row).toBeTruthy();

    const handler = vi.fn();
    document.addEventListener('install-prompt', handler);
    row.click();
    document.removeEventListener('install-prompt', handler);

    expect(handler).toHaveBeenCalledTimes(1);
    const event = handler.mock.calls[0]?.[0] as CustomEvent;
    expect(event.composed).toBe(true);
    expect(event.bubbles).toBe(true);
  });

  test('the iOS steps expand IN PLACE rather than opening a second popover', async () => {
    // A popover opened from inside a popover is two outside-click handlers, two
    // Escape paths and a z-order, for three lines of instructions.
    await mount({ iosInstructable: true });
    await openMenu();
    const row = menuRow(/add to home screen/i);
    expect(row).toBeTruthy();
    expect(row.getAttribute('aria-expanded')).toBe('false');
    expect(el.shadowRoot.querySelector('.menu-steps')).toBeNull();

    row.click();
    await el.updateComplete;

    expect(row.getAttribute('aria-expanded')).toBe('true');
    const steps = el.shadowRoot.querySelector('.menu-steps');
    expect(steps).not.toBeNull();
    expect(steps!.textContent).toContain('Share');
    expect(el.shadowRoot.querySelector('.ios-a2hs-popover'),
      'the separate popover is gone').toBeNull();
  });

  test('closing the menu collapses the steps', async () => {
    // Otherwise the next raise of the menu finds them already open, which reads
    // as the menu having remembered something it has no business remembering.
    await mount({ iosInstructable: true });
    await openMenu();
    menuRow(/add to home screen/i).click();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.menu-steps')).not.toBeNull();

    (el.shadowRoot.querySelector('.account-btn') as HTMLButtonElement).click();  // close
    await el.updateComplete;
    await openMenu();                                                            // reopen
    expect(el.shadowRoot.querySelector('.menu-steps')).toBeNull();
  });

  test('neither branch renders a row when the app is already installed', async () => {
    await mount({ installable: false, iosInstructable: false });
    await openMenu();
    expect(menuRow(/install app|add to home screen/i)).toBeUndefined();
  });
});

describe('178-07: bee-header sign-in / whoami / sign-out', () => {
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
    (el as any).authState = { authenticated: false, verified: true };
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
    (el as any).authState = { authenticated: true, verified: true, login: 'someuser', role: 'author', isAuthor: true };
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
    (el as any).authState = { authenticated: true, verified: true, login: 'guestuser', role: null, isAuthor: false };
    document.body.appendChild(el);
    await el.updateComplete;

    (el.shadowRoot!.querySelector('.account-btn') as HTMLButtonElement).click();
    await el.updateComplete;
    const badge = el.shadowRoot!.querySelector('.account-popover .whoami-badge')!;
    expect(badge).not.toBeNull();
    expect(badge.textContent).toContain('Not an editor');
    expect(badge.classList.contains('whoami-badge--guest')).toBe(true);
  });

  // beeatlas-1dc: an unverified identity is a signed-IN state — it must not
  // render as the Sign in button an offline cold start used to show.
  test('an unverified identity still renders as signed in, with a note and no remote avatar', async () => {
    await import('../bee-header.ts');
    el = document.createElement('bee-header') as any;
    (el as any).authState = {
      authenticated: true, verified: false, login: 'someuser',
      role: 'author', isAuthor: true, iconUrl: 'https://static.inaturalist.org/x.jpg',
    };
    document.body.appendChild(el);
    await el.updateComplete;

    const acct = el.shadowRoot!.querySelector('.account-btn') as HTMLButtonElement;
    expect(acct.getAttribute('aria-label')).toContain('someuser');
    // The avatar is the only networked part of the identity; requesting it is
    // exactly the doomed request the offline path exists to avoid.
    expect(el.shadowRoot!.querySelector('.account-avatar')).toBeNull();

    acct.click();
    await el.updateComplete;
    const popover = el.shadowRoot!.querySelector('.account-popover')!;
    expect(popover.textContent).toContain('someuser');
    expect(popover.querySelector('.whoami-badge')!.textContent).toContain('Author');
    expect(popover.querySelector('.menu-identity__note')).not.toBeNull();
    // Sign-out stays reachable: dismissing a session you cannot confirm is the
    // one action that must not require the network.
    expect(_popoverSignOut(el)).toBeTruthy();
  });

  test('a verified identity renders the avatar and no unverified note', async () => {
    await import('../bee-header.ts');
    el = document.createElement('bee-header') as any;
    (el as any).authState = {
      authenticated: true, verified: true, login: 'someuser',
      role: 'author', isAuthor: true, iconUrl: 'https://static.inaturalist.org/x.jpg',
    };
    document.body.appendChild(el);
    await el.updateComplete;

    expect(el.shadowRoot!.querySelector('.account-avatar')).not.toBeNull();
    (el.shadowRoot!.querySelector('.account-btn') as HTMLButtonElement).click();
    await el.updateComplete;
    expect(el.shadowRoot!.querySelector('.menu-identity__note')).toBeNull();
  });

  // The inlined avatar (api/avatar.py) is what makes the picture local, so the
  // rule that hid it offline no longer applies to it.
  test('an unverified identity DOES render the inlined avatar — a data: URL makes no request', async () => {
    await import('../bee-header.ts');
    const data = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
    el = document.createElement('bee-header') as any;
    (el as any).authState = {
      authenticated: true, verified: false, login: 'someuser',
      role: 'author', isAuthor: true,
      iconUrl: 'https://static.inaturalist.org/x.jpg',
      iconData: data,
    };
    document.body.appendChild(el);
    await el.updateComplete;

    const img = el.shadowRoot!.querySelector('.account-avatar') as HTMLImageElement;
    expect(img, 'the avatar should survive going offline now').not.toBeNull();
    // …and specifically from the inlined copy. Rendering iconUrl here would be
    // the doomed cross-origin request all over again.
    expect(img.getAttribute('src')).toBe(data);
  });

  test('a verified identity prefers the inlined avatar over the remote URL', async () => {
    await import('../bee-header.ts');
    const data = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
    el = document.createElement('bee-header') as any;
    (el as any).authState = {
      authenticated: true, verified: true, login: 'someuser', role: 'author', isAuthor: true,
      iconUrl: 'https://static.inaturalist.org/x.jpg', iconData: data,
    };
    document.body.appendChild(el);
    await el.updateComplete;

    // Same bytes either way, but one of them costs a request on every load.
    expect((el.shadowRoot!.querySelector('.account-avatar') as HTMLImageElement).getAttribute('src')).toBe(data);
  });

  test('dispatches a composed+bubbling sign-out event from the account popover', async () => {
    await import('../bee-header.ts');
    el = document.createElement('bee-header') as any;
    (el as any).authState = { authenticated: true, verified: true, login: 'someuser', role: 'author', isAuthor: true };
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

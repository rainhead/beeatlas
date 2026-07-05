import { test, expect, describe, vi, beforeEach } from 'vitest';

const authClientMocks = vi.hoisted(() => ({
  fetchWhoami: vi.fn(),
  fetchSpeciesNotes: vi.fn(),
  createNote: vi.fn(),
  updateNote: vi.fn(),
  deleteNote: vi.fn(),
  takedownNote: vi.fn(),
}));

vi.mock('../auth-client.ts', () => authClientMocks);

const OWN_NOTE = {
  id: 1,
  html: '<p>A <strong>great</strong> bee.</p>',
  byline: { login: 'author1', display_name: null, collector_url: null },
  created: '2026-07-01T00:00:00Z',
  updated: '2026-07-01T00:00:00Z',
  body_md: 'A **great** bee.',
  can_edit: true,
};

const OTHER_NOTE = {
  id: 2,
  html: '<p>Someone else’s note.</p>',
  byline: { login: 'other', display_name: 'Other Person', collector_url: '/collectors/other/' },
  created: '2026-06-01T00:00:00Z',
  updated: '2026-06-01T00:00:00Z',
};

async function mountBeeNotes(canonicalName = 'Agapostemon femoratus', bakedNotes: unknown[] = []) {
  await import('../bee-notes.ts');
  document.body.innerHTML = '<bee-notes></bee-notes>';
  const el = document.querySelector('bee-notes') as any;
  el.canonicalName = canonicalName;
  el.bakedNotes = bakedNotes;
  return el;
}

describe('bee-notes: hydration gating', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    document.body.innerHTML = '';
  });

  test('guest (not authenticated): calls fetchWhoami itself and stays inert', async () => {
    authClientMocks.fetchWhoami.mockResolvedValue({ authenticated: false });
    const el = await mountBeeNotes();
    await el.updateComplete;
    // allow the fetchWhoami() promise resolution + re-render to flush
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;

    expect(authClientMocks.fetchWhoami).toHaveBeenCalledTimes(1);
    expect(el.querySelector('.notes-section')).toBeNull();
    // Lit's empty template renders only its own comment markers -- no
    // visible content, no element children (identical to a page that never
    // loaded the script).
    expect(el.children.length).toBe(0);
    expect(el.textContent.trim()).toBe('');
  });

  test('signed-in non-author: stays inert', async () => {
    authClientMocks.fetchWhoami.mockResolvedValue({ authenticated: true, login: 'reader1', role: null, isAuthor: false });
    const el = await mountBeeNotes();
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;

    expect(el.querySelector('.notes-section')).toBeNull();
  });

  test('before whoami resolves: renders nothing (no flash)', async () => {
    let resolveWhoami!: (v: unknown) => void;
    authClientMocks.fetchWhoami.mockReturnValue(new Promise((resolve) => { resolveWhoami = resolve; }));
    const el = await mountBeeNotes();
    await el.updateComplete;

    expect(el.querySelector('.notes-section')).toBeNull();
    resolveWhoami({ authenticated: false });
  });

  test('confirmed author: renders own .notes-section and hides the baked #notes element', async () => {
    // Mock resolution must be set BEFORE the element is created/connected:
    // once `bee-notes` is already defined (from an earlier test in this
    // file), setting innerHTML upgrades + connects it synchronously, so
    // connectedCallback's fetchWhoami() call happens immediately.
    authClientMocks.fetchWhoami.mockResolvedValue({ authenticated: true, login: 'author1', role: 'author', isAuthor: true });
    await import('../bee-notes.ts');
    document.body.innerHTML = '<section id="notes"></section><bee-notes></bee-notes>';
    const el = document.querySelector('bee-notes') as any;
    el.canonicalName = 'Agapostemon femoratus';
    el.bakedNotes = [OWN_NOTE];
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;

    expect(el.querySelector('.notes-section')).not.toBeNull();
    expect(document.getElementById('notes')?.hasAttribute('hidden')).toBe(true);
  });
});

describe('bee-notes: author view', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    document.body.innerHTML = '';
    authClientMocks.fetchWhoami.mockResolvedValue({ authenticated: true, login: 'author1', role: 'author', isAuthor: true });
  });

  async function mountAsAuthor(bakedNotes: unknown[] = []) {
    const el = await mountBeeNotes('Agapostemon femoratus', bakedNotes);
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
    return el;
  }

  test('zero-baked author empty state: heading + empty copy + Add note, no network round-trip', async () => {
    const el = await mountAsAuthor([]);

    expect(el.querySelector('.notes-heading')?.textContent).toContain('Natural history notes');
    expect(el.querySelector('.note-empty')?.textContent).toContain('No notes yet');
    expect(el.querySelector('.note-add-btn')).not.toBeNull();
    expect(authClientMocks.fetchSpeciesNotes).not.toHaveBeenCalled();
  });

  test('seeds the list from bakedNotes and shows Edit/Delete only on own notes', async () => {
    const el = await mountAsAuthor([OWN_NOTE, OTHER_NOTE]);

    const articles = el.querySelectorAll('.note');
    expect(articles.length).toBe(2);
    const ownArticle = el.querySelector('[data-note-id="1"]');
    const otherArticle = el.querySelector('[data-note-id="2"]');
    expect(ownArticle?.querySelector('.note-owner-controls')).not.toBeNull();
    expect(otherArticle?.querySelector('.note-owner-controls')).toBeNull();
  });

  test('renders note body via unsafeHTML (trusted server html), and linked vs plain byline', async () => {
    const el = await mountAsAuthor([OWN_NOTE, OTHER_NOTE]);

    const ownBody = el.querySelector('[data-note-id="1"] .note-body');
    expect(ownBody?.innerHTML).toContain('<strong>great</strong>');
    // own note has no display_name/collector_url from the live shape -> plain @login
    expect(el.querySelector('[data-note-id="1"] .note-byline')?.tagName).toBe('SPAN');
    expect(el.querySelector('[data-note-id="1"] .note-byline')?.textContent).toContain('@author1');
    // other note has a collector_url -> linked
    const otherByline = el.querySelector('[data-note-id="2"] .note-byline');
    expect(otherByline?.tagName).toBe('A');
    expect(otherByline?.getAttribute('href')).toBe('/collectors/other/');
  });

  test('Add note: submits, re-fetches (D-02), closes editor, announces success — no optimistic update', async () => {
    const el = await mountAsAuthor([]);

    el.querySelector('.note-add-btn').click();
    await el.updateComplete;
    expect(el.querySelector('.note-textarea')).not.toBeNull();

    const textarea = el.querySelector('.note-textarea') as HTMLTextAreaElement;
    textarea.value = 'A new observation.';
    textarea.dispatchEvent(new Event('input'));
    await el.updateComplete;

    authClientMocks.createNote.mockResolvedValue({ ok: true, data: { id: 99 } });
    authClientMocks.fetchSpeciesNotes.mockResolvedValue([{ ...OWN_NOTE, id: 99, html: '<p>A new observation.</p>' }]);

    el.querySelector('.note-btn--primary').click();
    // In-flight: submit disabled, no optimistic insert yet.
    await el.updateComplete;

    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;

    expect(authClientMocks.createNote).toHaveBeenCalledWith('Agapostemon femoratus', 'A new observation.');
    expect(authClientMocks.fetchSpeciesNotes).toHaveBeenCalledWith('Agapostemon femoratus');
    // editor closed
    expect(el.querySelector('.note-textarea')).toBeNull();
    // re-rendered from the live re-fetch result, not an optimistic client-built entry
    expect(el.querySelector('[data-note-id="99"]')).not.toBeNull();
    expect(el.querySelector('.note-status')?.textContent).toContain('Note posted.');
  });

  test('Delete: inline two-step confirm (no native confirm/modal), then re-fetch removes the note', async () => {
    const confirmSpy = vi.fn();
    window.confirm = confirmSpy;
    const el = await mountAsAuthor([OWN_NOTE]);

    el.querySelector('[data-note-id="1"] .note-btn--danger').click();
    await el.updateComplete;

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(el.querySelector('.note-delete-confirm')).not.toBeNull();
    expect(el.querySelector('.note-delete-confirm')?.textContent).toContain('Delete this note?');

    authClientMocks.deleteNote.mockResolvedValue({ ok: true, data: { id: 1 } });
    authClientMocks.fetchSpeciesNotes.mockResolvedValue([]);

    el.querySelector('.note-delete-confirm .note-btn--danger').click();
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;

    expect(authClientMocks.deleteNote).toHaveBeenCalledWith(1);
    expect(el.querySelector('[data-note-id="1"]')).toBeNull();
    expect(el.querySelector('.note-status')?.textContent).toContain('Note deleted.');
  });

  test('Delete confirm Cancel reverts to normal Edit/Delete controls without calling deleteNote', async () => {
    const el = await mountAsAuthor([OWN_NOTE]);

    el.querySelector('[data-note-id="1"] .note-btn--danger').click();
    await el.updateComplete;
    expect(el.querySelector('.note-delete-confirm')).not.toBeNull();

    el.querySelector('.note-delete-confirm .note-btn:not(.note-btn--danger)').click();
    await el.updateComplete;

    expect(el.querySelector('.note-delete-confirm')).toBeNull();
    expect(el.querySelector('[data-note-id="1"] .note-owner-controls')).not.toBeNull();
    expect(authClientMocks.deleteNote).not.toHaveBeenCalled();
  });

  test('Edit prefills from body_md and 403 (ownership lost) shows the ownership-lost copy and drops controls on re-fetch', async () => {
    const el = await mountAsAuthor([OWN_NOTE]);

    el.querySelector('[data-note-id="1"] .note-btn--edit').click();
    await el.updateComplete;

    const textarea = el.querySelector('.note-textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('A **great** bee.');

    authClientMocks.updateNote.mockResolvedValue({ ok: false, status: 403 });
    // Simulate the role being revoked mid-session: the re-fetch after the 403
    // no longer carries can_edit for this author.
    authClientMocks.fetchSpeciesNotes.mockResolvedValue([{ ...OWN_NOTE, can_edit: undefined, body_md: undefined }]);

    el.querySelector('.note-btn--primary').click();
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;

    expect(el.querySelector('.note-textarea')).toBeNull();
    expect(el.querySelector('.note-error')?.textContent).toContain('no longer have permission');
    expect(el.querySelector('[data-note-id="1"] .note-owner-controls')).toBeNull();
  });

  test('Escape while textarea focused cancels the editor and discards the draft', async () => {
    const el = await mountAsAuthor([]);

    el.querySelector('.note-add-btn').click();
    await el.updateComplete;
    const textarea = el.querySelector('.note-textarea') as HTMLTextAreaElement;
    textarea.value = 'discarded draft';
    textarea.dispatchEvent(new Event('input'));
    await el.updateComplete;

    textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await el.updateComplete;

    expect(el.querySelector('.note-textarea')).toBeNull();
    expect(authClientMocks.createNote).not.toHaveBeenCalled();
  });

  test('empty/whitespace-only submit does nothing (no request sent)', async () => {
    const el = await mountAsAuthor([]);

    el.querySelector('.note-add-btn').click();
    await el.updateComplete;
    const textarea = el.querySelector('.note-textarea') as HTMLTextAreaElement;
    textarea.value = '   ';
    textarea.dispatchEvent(new Event('input'));
    await el.updateComplete;

    el.querySelector('.note-btn--primary').click();
    await el.updateComplete;

    expect(authClientMocks.createNote).not.toHaveBeenCalled();
    expect(el.querySelector('.note-textarea')).not.toBeNull();
  });
});

describe('bee-notes: curator controls (D-01/D-02/D-03)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    document.body.innerHTML = '';
  });

  async function mountAsCurator(bakedNotes: unknown[] = []) {
    authClientMocks.fetchWhoami.mockResolvedValue({
      authenticated: true, login: 'curator1', role: 'curator', isAuthor: true, isCurator: true,
    });
    const el = await mountBeeNotes('Agapostemon femoratus', bakedNotes);
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;
    return el;
  }

  test('curator-only login (isAuthor true server-side) still passes the top-level render gate', async () => {
    const el = await mountAsCurator([OTHER_NOTE]);

    expect(el.querySelector('.notes-section')).not.toBeNull();
  });

  test('curator sees a Take down control on a note they do NOT own (can_edit: false)', async () => {
    const el = await mountAsCurator([OTHER_NOTE]);

    const article = el.querySelector('[data-note-id="2"]');
    const takedownBtn = article?.querySelector('[aria-label="Take down this note (curator)"]');
    expect(takedownBtn).not.toBeNull();
    expect(takedownBtn?.textContent).toContain('Take down');
    // Curator is not the owner of this note -- no owner controls should render.
    expect(article?.querySelector('.note-owner-controls .note-btn--edit')).toBeNull();
  });

  test('a signed-in non-curator author does NOT see the Take down control', async () => {
    authClientMocks.fetchWhoami.mockResolvedValue({
      authenticated: true, login: 'author1', role: 'author', isAuthor: true, isCurator: false,
    });
    const el = await mountBeeNotes('Agapostemon femoratus', [OWN_NOTE, OTHER_NOTE]);
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;

    expect(el.querySelector('[aria-label="Take down this note (curator)"]')).toBeNull();
  });

  test('clicking Take down opens inline confirm; confirming POSTs takedown then refetches (no optimistic removal)', async () => {
    const el = await mountAsCurator([OTHER_NOTE]);

    el.querySelector('[data-note-id="2"] [aria-label="Take down this note (curator)"]').click();
    await el.updateComplete;

    expect(el.querySelector('.note-delete-confirm')).not.toBeNull();
    expect(el.querySelector('.note-delete-confirm')?.textContent).toContain('Take down this note?');

    authClientMocks.takedownNote.mockResolvedValue({ ok: true, data: { id: 2 } });
    authClientMocks.fetchSpeciesNotes.mockResolvedValue([]);

    el.querySelector('.note-delete-confirm .note-btn--danger').click();
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;

    expect(authClientMocks.takedownNote).toHaveBeenCalledWith(2);
    expect(authClientMocks.fetchSpeciesNotes).toHaveBeenCalledWith('Agapostemon femoratus');
    expect(el.querySelector('[data-note-id="2"]')).toBeNull();
    expect(el.querySelector('.note-status')?.textContent).toContain('Note taken down.');
  });

  test('Take down confirm Cancel reverts to the plain control without calling takedownNote', async () => {
    const el = await mountAsCurator([OTHER_NOTE]);

    el.querySelector('[data-note-id="2"] [aria-label="Take down this note (curator)"]').click();
    await el.updateComplete;
    expect(el.querySelector('.note-delete-confirm')).not.toBeNull();

    el.querySelector('.note-delete-confirm .note-btn:not(.note-btn--danger)').click();
    await el.updateComplete;

    expect(el.querySelector('.note-delete-confirm')).toBeNull();
    expect(el.querySelector('[aria-label="Take down this note (curator)"]')).not.toBeNull();
    expect(authClientMocks.takedownNote).not.toHaveBeenCalled();
  });

  test('a mocked 403 (curator revoked mid-session) shows the revoked-permission banner and refetches', async () => {
    const el = await mountAsCurator([OTHER_NOTE]);

    el.querySelector('[data-note-id="2"] [aria-label="Take down this note (curator)"]').click();
    await el.updateComplete;

    authClientMocks.takedownNote.mockResolvedValue({ ok: false, status: 403 });
    authClientMocks.fetchSpeciesNotes.mockResolvedValue([{ ...OTHER_NOTE }]);

    el.querySelector('.note-delete-confirm .note-btn--danger').click();
    await el.updateComplete;
    await new Promise((r) => setTimeout(r, 0));
    await el.updateComplete;

    expect(el.querySelector('.note-error')?.textContent).toContain('no longer have curator permission');
    expect(authClientMocks.fetchSpeciesNotes).toHaveBeenCalled();
  });
});

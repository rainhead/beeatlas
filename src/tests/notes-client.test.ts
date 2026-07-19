import { test, expect, describe, vi, afterEach } from 'vitest';

// (fetchSpeciesNotes and its tests died with st-vjd — the GET /api/notes
// live read is gone; the baked page is the only note read path.)

describe('auth-client: createNote', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('POSTs JSON with credentials:include and resolves {ok:true} on 201', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 201, json: () => Promise.resolve({ id: 42 }) });
    vi.stubGlobal('fetch', fetchMock);

    const { createNote } = await import('../auth-client.ts');
    const result = await createNote('Agapostemon femoratus', 'A **great** bee.');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls.at(0) ?? [];
    expect(String(url)).toContain('/api/notes');
    expect(opts).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(opts.headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(JSON.parse(opts.body)).toEqual({ canonical_name: 'Agapostemon femoratus', body_md: 'A **great** bee.' });
    expect(result).toEqual({ ok: true, data: { id: 42 } });
  });

  test('resolves {ok:false, status} on a non-2xx response (e.g. 403)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 403, json: () => Promise.resolve({}) });
    vi.stubGlobal('fetch', fetchMock);

    const { createNote } = await import('../auth-client.ts');
    const result = await createNote('Agapostemon femoratus', 'draft');

    expect(result).toEqual({ ok: false, status: 403 });
  });

  test('resolves {ok:false, status:0} (never throws) on a rejected fetch', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    const { createNote } = await import('../auth-client.ts');
    await expect(createNote('Agapostemon femoratus', 'draft')).resolves.toEqual({ ok: false, status: 0 });
  });
});

describe('auth-client: updateNote', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('PATCHes /api/notes/<id> with credentials:include and resolves {ok:true} on 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ id: 7 }) });
    vi.stubGlobal('fetch', fetchMock);

    const { updateNote } = await import('../auth-client.ts');
    const result = await updateNote(7, 'edited body');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls.at(0) ?? [];
    expect(String(url)).toContain('/api/notes/7');
    expect(opts).toMatchObject({ method: 'PATCH', credentials: 'include' });
    expect(JSON.parse(opts.body)).toEqual({ body_md: 'edited body' });
    expect(result).toEqual({ ok: true, data: { id: 7 } });
  });

  test('surfaces 403 distinctly (ownership lost)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 403, json: () => Promise.resolve({}) });
    vi.stubGlobal('fetch', fetchMock);

    const { updateNote } = await import('../auth-client.ts');
    const result = await updateNote(7, 'edited body');

    expect(result).toEqual({ ok: false, status: 403 });
  });

  test('resolves {ok:false, status:0} (never throws) on a rejected fetch', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    const { updateNote } = await import('../auth-client.ts');
    await expect(updateNote(7, 'x')).resolves.toEqual({ ok: false, status: 0 });
  });
});

describe('auth-client: deleteNote', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  test('DELETEs /api/notes/<id> with credentials:include and resolves {ok:true} on 200', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ id: 9 }) });
    vi.stubGlobal('fetch', fetchMock);

    const { deleteNote } = await import('../auth-client.ts');
    const result = await deleteNote(9);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls.at(0) ?? [];
    expect(String(url)).toContain('/api/notes/9');
    expect(opts).toMatchObject({ method: 'DELETE', credentials: 'include' });
    expect(result).toEqual({ ok: true, data: { id: 9 } });
  });

  test('surfaces 403 distinctly (ownership lost)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 403, json: () => Promise.resolve({}) });
    vi.stubGlobal('fetch', fetchMock);

    const { deleteNote } = await import('../auth-client.ts');
    const result = await deleteNote(9);

    expect(result).toEqual({ ok: false, status: 403 });
  });

  test('resolves {ok:false, status:0} (never throws) on a rejected fetch', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network down'));
    vi.stubGlobal('fetch', fetchMock);

    const { deleteNote } = await import('../auth-client.ts');
    await expect(deleteNote(9)).resolves.toEqual({ ok: false, status: 0 });
  });
});

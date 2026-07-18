// Phase 179-05 (NOTES-01/02/04) — the progressive-enhancement authoring
// island over the baked <section class="notes-section" id="notes"> that
// _pages/species-detail.njk always emits (179-04).
//
// Light-DOM (createRenderRoot returns this), copied verbatim from
// src/species/seasonality-viz.ts — this is load-bearing: it lets this
// component's own Lit-rendered markup share the exact same
// .notes-section/.note-list/.note/.note-body/.note-meta CSS classes (and
// rules, defined in src/styles/taxon-pages.css) as the Nunjucks-baked
// markup, so the two never visually diverge. No `static styles` block is
// used here for the same reason it's inert on seasonality-viz in light DOM
// (see taxon-pages.css's `seasonality-viz .band-winter` etc. duplicating
// what that component's static styles cannot apply) — this component's
// classes are unprefixed precisely so they match the baked markup.
//
// Auth gating (D-01, RESEARCH Pattern 5): this component calls
// fetchWhoami() itself in connectedCallback — it NEVER reads <bee-header>'s
// DOM/state (separate Vite entry chunks, no shared module-level mutable
// state; coupling would race). For a guest/non-author/no-JS/offline
// reader it stays fully inert — the baked #notes section (if any) is the
// only display.
//
// Live re-fetch after write (D-02): after every confirmed create/edit/
// delete, re-fetches this species' notes from the read endpoint and
// re-renders from that live data — no optimistic update, ever.
//
// No client markdown / no client sanitizer (D-04): note bodies render via
// Lit's unsafeHTML on the trusted server-produced `html` field only.
import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import {
  fetchWhoami,
  fetchSpeciesNotes,
  createNote,
  updateNote,
  deleteNote,
  takedownNote,
  type AuthState,
  type NoteView,
} from './auth-client.ts';
import { formatDate } from './lib/formatDate.js';

const SAVE_ERROR_COPY = "Couldn't save your note. Check your connection and try again.";
const OWNERSHIP_LOST_COPY = 'You no longer have permission to edit this note.';
const TAKEDOWN_ERROR_COPY = "Couldn't take down this note. Check your connection and try again.";
const CURATOR_LOST_COPY = 'You no longer have curator permission for this action.';

type EditorMode = 'add' | 'edit' | null;

@customElement('bee-notes')
export class BeeNotes extends LitElement {
  // Set by the njk data-handoff script (179-04) once bee-notes is defined.
  @property({ attribute: false }) canonicalName = '';
  @property({ attribute: false }) bakedNotes: NoteView[] = [];

  // null while fetchWhoami() is in flight (and forever for guests/non-authors).
  @state() private _authState: AuthState | null = null;
  // null until the first successful write triggers a live re-fetch (D-02) —
  // until then the author view is seeded from bakedNotes (no extra round-trip).
  @state() private _liveNotes: NoteView[] | null = null;

  @state() private _editorMode: EditorMode = null;
  @state() private _editTargetId: number | null = null;
  @state() private _draft = '';
  @state() private _inFlight = false;
  @state() private _editorError: string | null = null;

  @state() private _deleteConfirmId: number | null = null;
  @state() private _deleteErrorNoteId: number | null = null;
  @state() private _deleteError: string | null = null;

  // Curator take-down state (D-01/D-02) -- kept independent of the owner's
  // delete-confirm slices above: a curator viewing their own note could in
  // principle have both an owner-delete-confirm row and a curator-takedown
  // -confirm row open at once.
  @state() private _takedownConfirmId: number | null = null;
  @state() private _takedownErrorNoteId: number | null = null;
  @state() private _takedownError: string | null = null;

  // Persistent aria-live announcement / ownership-lost notice shown near the
  // heading row (survives the editor closing, per UI-SPEC's "announce
  // 'Note posted.'" after the editor has already closed).
  @state() private _banner: string | null = null;
  @state() private _bannerIsError = false;

  protected createRenderRoot(): HTMLElement {
    return this;
  }

  connectedCallback(): void {
    super.connectedCallback();
    fetchWhoami().then((auth) => {
      this._authState = auth;
      if (auth.authenticated && auth.isAuthor) {
        // Avoid a duplicate note list in the accessibility tree once this
        // island takes over the display (UI-SPEC "How <bee-notes> relates
        // to the baked #notes section").
        document.getElementById('notes')?.setAttribute('hidden', '');
      }
    });
  }

  private get _isAuthor(): boolean {
    return this._authState?.authenticated === true && this._authState?.isAuthor === true;
  }

  // Curator-only signal (D-03): a UX affordance only -- the takedown POST is
  // always independently re-authorized server-side (a forged/stale client
  // flag yields a 403, surfaced via CURATOR_LOST_COPY + refetch).
  private get _isCurator(): boolean {
    return this._authState?.authenticated === true && this._authState?.isCurator === true;
  }

  private get _notes(): NoteView[] {
    return this._liveNotes ?? this.bakedNotes ?? [];
  }

  private async _refetch(): Promise<void> {
    this._liveNotes = await fetchSpeciesNotes(this.canonicalName);
  }

  private _focusAfter(selector: string): void {
    void this.updateComplete.then(() => {
      this.querySelector<HTMLElement>(selector)?.focus();
    });
  }

  private _openAdd = (): void => {
    this._editorMode = 'add';
    this._editTargetId = null;
    this._draft = '';
    this._editorError = null;
    this._deleteConfirmId = null;
    this._focusAfter('.note-textarea');
  };

  private _openEdit = (note: NoteView): void => {
    this._editorMode = 'edit';
    this._editTargetId = note.id;
    this._draft = note.body_md ?? '';
    this._editorError = null;
    this._deleteConfirmId = null;
    this._focusAfter('.note-textarea');
  };

  private _cancelEditor = (): void => {
    const wasEdit = this._editorMode === 'edit';
    const targetId = this._editTargetId;
    this._editorMode = null;
    this._editTargetId = null;
    this._draft = '';
    this._editorError = null;
    if (wasEdit && targetId != null) {
      this._focusAfter(`[data-note-id="${targetId}"] .note-btn--edit`);
    } else {
      this._focusAfter('.note-add-btn');
    }
  };

  private _onTextareaKeydown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      this._cancelEditor();
    }
  };

  private _onDraftInput = (e: Event): void => {
    this._draft = (e.target as HTMLTextAreaElement).value;
  };

  private _submitEditor = async (): Promise<void> => {
    const body = this._draft.trim();
    if (!body) return;

    const wasEdit = this._editorMode === 'edit';
    const editTargetId = this._editTargetId;

    this._inFlight = true;
    this._editorError = null;

    const result = wasEdit && editTargetId != null
      ? await updateNote(editTargetId, body)
      : await createNote(this.canonicalName, body);

    this._inFlight = false;

    if (result.ok) {
      await this._refetch();
      this._editorMode = null;
      this._editTargetId = null;
      this._draft = '';
      this._editorError = null;
      this._banner = wasEdit ? 'Note updated.' : 'Note posted.';
      this._bannerIsError = false;
      if (wasEdit && editTargetId != null) {
        this._focusAfter(`[data-note-id="${editTargetId}"] .note-btn--edit`);
      } else {
        this._focusAfter('.note-add-btn');
      }
      return;
    }

    if (result.status === 403) {
      this._editorMode = null;
      this._editTargetId = null;
      this._draft = '';
      this._editorError = null;
      this._banner = OWNERSHIP_LOST_COPY;
      this._bannerIsError = true;
      // Server truth wins — re-fetch drops the now-stale edit/delete
      // controls for this author on the next render.
      await this._refetch();
      return;
    }

    this._editorError = SAVE_ERROR_COPY;
  };

  private _openDeleteConfirm = (noteId: number): void => {
    this._deleteConfirmId = noteId;
    this._deleteErrorNoteId = null;
    this._deleteError = null;
  };

  private _cancelDeleteConfirm = (): void => {
    this._deleteConfirmId = null;
  };

  private _confirmDelete = async (noteId: number): Promise<void> => {
    this._inFlight = true;
    this._deleteError = null;

    const result = await deleteNote(noteId);

    this._inFlight = false;

    if (result.ok) {
      await this._refetch();
      this._deleteConfirmId = null;
      this._banner = 'Note deleted.';
      this._bannerIsError = false;
      return;
    }

    if (result.status === 403) {
      this._deleteConfirmId = null;
      this._banner = OWNERSHIP_LOST_COPY;
      this._bannerIsError = true;
      await this._refetch();
      return;
    }

    this._deleteConfirmId = null;
    this._deleteErrorNoteId = noteId;
    this._deleteError = SAVE_ERROR_COPY;
  };

  private _openTakedownConfirm = (noteId: number): void => {
    this._takedownConfirmId = noteId;
    this._takedownErrorNoteId = null;
    this._takedownError = null;
  };

  private _cancelTakedownConfirm = (): void => {
    this._takedownConfirmId = null;
  };

  private _confirmTakedown = async (noteId: number): Promise<void> => {
    this._inFlight = true;
    this._takedownError = null;

    const result = await takedownNote(noteId);

    this._inFlight = false;

    if (result.ok) {
      await this._refetch();
      this._takedownConfirmId = null;
      this._banner = 'Note taken down.';
      this._bannerIsError = false;
      return;
    }

    if (result.status === 403) {
      this._takedownConfirmId = null;
      this._banner = CURATOR_LOST_COPY;
      this._bannerIsError = true;
      // Server truth wins -- re-fetch drops the now-stale "Take down"
      // control for this curator on the next render.
      await this._refetch();
      return;
    }

    this._takedownConfirmId = null;
    this._takedownErrorNoteId = noteId;
    this._takedownError = TAKEDOWN_ERROR_COPY;
  };

  private _renderEditor(submitLabel: string) {
    return html`
      <div class="note-editor">
        <textarea
          class="note-textarea"
          aria-label="Note text"
          placeholder="Share a natural-history observation…"
          .value=${this._draft}
          @input=${this._onDraftInput}
          @keydown=${this._onTextareaKeydown}
          ?disabled=${this._inFlight}
        ></textarea>
        <p class="note-hint">Supports **bold**, *italic*, links, and lists.</p>
        <div class="note-editor-actions">
          <button
            class="note-btn note-btn--primary"
            @click=${this._submitEditor}
            ?disabled=${this._inFlight}
          >${this._inFlight ? 'Saving…' : submitLabel}</button>
          <button class="note-btn" @click=${this._cancelEditor} ?disabled=${this._inFlight}>Cancel</button>
          ${this._inFlight ? html`<span class="note-status" aria-live="polite">Saving…</span>` : ''}
        </div>
        ${this._editorError ? html`<p class="note-error" role="alert">${this._editorError}</p>` : ''}
      </div>
    `;
  }

  private _renderOwnerControls(note: NoteView) {
    if (this._deleteConfirmId === note.id) {
      return html`
        <div class="note-delete-confirm">
          Delete this note?
          <button
            class="note-btn note-btn--danger"
            @click=${() => this._confirmDelete(note.id)}
            ?disabled=${this._inFlight}
          >${this._inFlight ? 'Deleting…' : 'Delete'}</button>
          <button class="note-btn" @click=${this._cancelDeleteConfirm} ?disabled=${this._inFlight}>Cancel</button>
          ${this._inFlight ? html`<span class="note-status" aria-live="polite">Deleting…</span>` : ''}
        </div>
      `;
    }
    return html`
      <div class="note-owner-controls">
        <button class="note-btn note-btn--edit" aria-label="Edit your note" @click=${() => this._openEdit(note)}>Edit</button>
        <button class="note-btn note-btn--danger" aria-label="Delete your note" @click=${() => this._openDeleteConfirm(note.id)}>Delete</button>
      </div>
    `;
  }

  private _renderCuratorControls(note: NoteView) {
    if (this._takedownConfirmId === note.id) {
      return html`
        <div class="note-delete-confirm">
          Take down this note?
          <button
            class="note-btn note-btn--danger"
            @click=${() => this._confirmTakedown(note.id)}
            ?disabled=${this._inFlight}
          >${this._inFlight ? 'Taking down…' : 'Take down'}</button>
          <button class="note-btn" @click=${this._cancelTakedownConfirm} ?disabled=${this._inFlight}>Cancel</button>
          ${this._inFlight ? html`<span class="note-status" aria-live="polite">Taking down…</span>` : ''}
        </div>
      `;
    }
    return html`
      <div class="note-owner-controls">
        <button class="note-btn note-btn--danger" aria-label="Take down this note (curator)" @click=${() => this._openTakedownConfirm(note.id)}>Take down</button>
      </div>
    `;
  }

  private _renderNote(note: NoteView) {
    const isEditingThis = this._editorMode === 'edit' && this._editTargetId === note.id;
    const byline = note.byline.display_name ?? `@${note.byline.login}`;

    return html`
      <article class="note" data-note-id=${note.id}>
        ${isEditingThis
          ? this._renderEditor('Save changes')
          : html`<div class="note-body">${unsafeHTML(note.html)}</div>`}
        <footer class="note-meta">
          ${note.byline.collector_url
            ? html`<a class="note-byline" href=${note.byline.collector_url}>${byline}</a>`
            : html`<span class="note-byline">${byline}</span>`}
          <time class="note-timestamp" datetime=${note.created}>${formatDate(note.created)}</time>
          ${note.updated !== note.created ? html`<span class="note-edited">(edited)</span>` : ''}
        </footer>
        ${note.can_edit && !isEditingThis ? this._renderOwnerControls(note) : ''}
        ${this._isCurator && !isEditingThis ? this._renderCuratorControls(note) : ''}
        ${this._deleteErrorNoteId === note.id && this._deleteError
          ? html`<p class="note-error" role="alert">${this._deleteError}</p>`
          : ''}
        ${this._takedownErrorNoteId === note.id && this._takedownError
          ? html`<p class="note-error" role="alert">${this._takedownError}</p>`
          : ''}
      </article>
    `;
  }

  render() {
    // Default (whoami in flight) and guest/non-author after it resolves:
    // fully inert. The baked #notes section (if present) is the sole display.
    if (!this._isAuthor) return html``;

    const notes = this._notes;

    return html`
      <section class="notes-section">
        <div class="notes-heading-row">
          <h2 class="notes-heading">Community notes</h2>
          ${this._editorMode === null
            ? html`<button class="note-btn note-btn--primary note-add-btn" @click=${this._openAdd}>Add note</button>`
            : ''}
        </div>
        ${this._banner
          ? this._bannerIsError
            ? html`<p class="note-error" role="alert">${this._banner}</p>`
            : html`<span class="note-status" aria-live="polite">${this._banner}</span>`
          : ''}
        ${this._editorMode === 'add' ? this._renderEditor('Post note') : ''}
        ${notes.length === 0
          ? html`<p class="note-empty">No notes yet — be the first to add one.</p>`
          : html`<div class="note-list">${notes.map((note) => this._renderNote(note))}</div>`}
      </section>
    `;
  }
}

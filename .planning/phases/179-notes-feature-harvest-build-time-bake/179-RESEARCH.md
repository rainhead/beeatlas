# Phase 179: Notes Feature + Harvest → Build-Time Bake - Research

**Researched:** 2026-07-04
**Domain:** Python server-side markdown rendering + HTML sanitization; Flask REST CRUD extending an existing auth layer; Alembic forward-only SQLite migration (add column + FK, batch mode); a hydrating Lit island on an Eleventy-static page; a build-time JSON harvest mirroring an existing precedent.
**Confidence:** HIGH (all five research questions verified against source code already in this repo, PyPI registry data, and the projects' own GitHub source; only the "renderer/sanitizer choice" leans on WebSearch, cross-verified against PyPI JSON + slopcheck + GitHub source)

## Summary

Phase 179 has very little architectural discovery to do — CONTEXT.md's D-01..D-13 already pin the shape of everything. The real work is: (1) pick and verify a maintained Python markdown-renderer + HTML-sanitizer pair, (2) design the note CRUD + read endpoints as a straight extension of the already-shipped `api/auth.py`/`api/main.py` pattern, (3) write one more forward-only Alembic migration following the exact shape of `0002_add_users_table.py`, (4) build a small hydrating Lit island that independently calls `fetchWhoami()` (do not couple it to the separately-chunked `<bee-header>` controller), and (5) place the harvest script as a new `run.py` STEP **after** `collectors-export`, not folded into `species_export.py`.

**Primary recommendation:** Use **`markdown-it-py`** (zero-preset, explicitly enabled rule allowlist: `emphasis`, `link`, `paragraph`, `list`, `list_item`) for rendering, and **`nh3`** (Ammonia Rust binding) for sanitizing the rendered HTML to a tag/attribute allowlist. Both verified via PyPI registry (current, actively released as of June 2026) and `slopcheck install` (`[OK]` for both). Do **not** use `bleach` — it announced end-of-life on 2026-06-05 (no further releases, including security fixes); nh3 is its explicit successor. Put the shared `render_note_markdown(body_md) -> body_html` helper in `data/notes_store/` (e.g. `notes_store/render.py`) so both `api/` (writes) and `data/` (harvest, if it ever needs to re-render) import the same single implementation — `api/main.py` already imports from `notes_store.*`, so this requires no new cross-package wiring.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Markdown→HTML render + sanitize | API / Backend (`api/` write path, via shared `notes_store` helper) | — | D-04: exactly one renderer, in Python, never shipped to the browser |
| Note CRUD (create/edit/soft-delete) | API / Backend (`api/main.py` new routes) | Database / Storage (SQLite via `notes_store`) | Extends the existing `require_author`-guarded Flask app; ownership check is server-derived |
| Note read (for the live island) | API / Backend (new `GET` route) | — | Public read of `approved`-only notes; no auth required, but still API-tier (not static) |
| Species-page authoring UI (island) | Browser / Client (Lit component) | Frontend build (Eleventy/Vite entry) | D-01: hydrates in place on a static page; pure presenter of API state |
| Baked notes list (offline/no-JS) | CDN / Static (Eleventy-rendered HTML from `notes.json`) | Build-time (`data/` harvest script) | Read path stays 100% static; the island is enhancement only |
| Harvest (`notes.json` producer) | Build-time (`data/` nightly pipeline) | Database / Storage (reads SQLite read-only WAL) | D-09: new build-time script, not folded into `species_export.py` |
| Artifact publish/manifest/fetch | Build-time (`data/artifacts.toml` + `data/artifacts.py` + `deploy.yml`) | CDN / Static | D-09/D-10: `authoritative`, `build_time_fetch=true`, never committed |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `markdown-it-py` | 4.2.0 (verified via PyPI JSON, released 2026-05-07) `[VERIFIED: pypi registry, slopcheck OK]` | Markdown → HTML rendering, restricted subset | CommonMark-compliant, **safe by default** (`html: False` even in its default preset); the `"zero"` preset + `.enable([...])` gives an explicit rule allowlist — the natural fit for "restricted markdown," rather than needing custom-renderer surgery (mistune's approach). Maintained by the ExecutableBooks org (also powers MyST/Jupyter Book/mkdocs-material's Python markdown paths). |
| `nh3` | 0.3.6 (verified via PyPI JSON, released 2026-06-22) `[VERIFIED: pypi registry, slopcheck OK]` | HTML sanitizer (tag/attribute allowlist, applied to the rendered HTML) | Rust (Ammonia) binding, ~20x faster than bleach, and is bleach's own documented successor. `nh3.clean()` signature confirmed directly from the project's Rust source (`messense/nh3` on GitHub): `tags`, `attributes`, `attribute_filter`, `strip_comments=True`, `link_rel="noopener noreferrer"` (**default already satisfies D-06's `rel="noopener"` requirement**), `url_schemes`, `generic_attribute_prefixes`, etc. |

**Installation (add to `data/pyproject.toml` — the shared venv `api/` also uses, per `[tool.pytest.ini_options] testpaths = ["tests", "../api/tests"]` and the absence of a separate `api/pyproject.toml`):**
```bash
cd data && uv add nh3 markdown-it-py
```

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `markdown-it-py` | `mistune` (3.3.2, also actively maintained) | Faster, but not CommonMark-compliant and requires writing a custom `Renderer` subclass to restrict output — more custom code to audit for an XSS-adjacent feature. `markdown-it-py`'s rule-allowlist is a declarative alternative to that custom renderer. |
| `nh3` | `bleach` (6.4.0) | **Rejected** — bleach announced end-of-life 2026-06-05 (dependency on unmaintained `html5lib`); no further releases including security patches. Do not introduce a dependency that is dead on arrival. |
| `nh3` | `mdx_bleach` / `sanitize-markdown` (JS) | Both are either bleach-dependent or JS-side (violates D-04's "no markdown/sanitizer logic ships to the client"). Not applicable. |

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `nh3` | PyPI | Since ~2021 (messense/nh3), 33 published releases | ~47.5M/month (pypistats) | github.com/messense/nh3 | [OK] (verified via isolated scratch-venv `slopcheck install`) | Approved |
| `markdown-it-py` | PyPI | Since ~2019 (executablebooks/markdown-it-py), 45 published releases | Not directly queryable (pypistats endpoint returned empty for this hyphenated name), but the GitHub org (ExecutableBooks) is well-established and the package is a transitive dependency of Jupyter/MyST/mkdocs-material | github.com/executablebooks/markdown-it-py | [OK] (verified via isolated scratch-venv `slopcheck install`) | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none.

Both packages were verified via `slopcheck install nh3 markdown-it-py --ecosystem pypi` run inside a throwaway venv (not the project's `data/.venv`) — both returned `[OK]`. Package names were additionally cross-checked against each project's own GitHub source (nh3's Rust `lib.rs`, confirming the real `clean()` signature) — this satisfies the stricter "discovered via non-authoritative source but confirmed via official source" bar, so these are tagged `[VERIFIED]` rather than `[ASSUMED]`.

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────┐        ┌──────────────────────────────┐
│  Species page (static HTML) │        │  api.beeatlas.net (Flask/     │
│  _pages/species-detail.njk  │        │  Waitress, existing 178 app)  │
│                              │        │                                │
│  <section class="notes">    │        │  GET  /api/notes?species=X     │
│    (baked list from         │◄───────┤       (public, approved-only)  │
│     notes.json, SSR by      │  fetch │  POST /api/notes               │
│     Eleventy — always       │  (JS,  │       @require_author          │
│     present, offline-safe)  │  D-02) │  PATCH /api/notes/<id>          │
│  </section>                 ├───────►│       @require_author + owner   │
│                              │        │  DELETE /api/notes/<id>        │
│  <script type=module         │        │       @require_author + owner   │
│   src=".../taxon-page.ts">   │        │                                │
│    → notes-island.ts         │        │  render_note_markdown()        │
│    (Lit, hydrates only       │        │  (notes_store/render.py:       │
│    when fetchWhoami()        │        │   markdown-it-py → nh3)        │
│    reports isAuthor)         │        │        │                        │
└──────────────┬───────────────┘        │        ▼                        │
               │                         │  notes / note_revisions /      │
               │ (offline / no-JS:       │  users  (SQLite, WAL mode,      │
               │  island never mounts;   │  Alembic-migrated)              │
               │  baked list is sole     │        ▲                        │
               │  source of truth)       └────────┼────────────────────────┘
               │                                  │ read-only WAL connection
               ▼                                  │ (D-16)
┌──────────────────────────────┐        ┌──────────┴─────────────────────┐
│  nightly.sh pipeline (data/)  │        │  data/notes_harvest.py (NEW)   │
│  run.py STEPS:                │───────►│  runs AFTER "collectors-export" │
│   ... collectors-export       │  new   │  reads notes WHERE             │
│   collectors-events-export    │  STEP  │  status='approved' ORDER BY    │
│   notes-harvest  ← inserted   │        │  created_at DESC                │
│   here (after collectors)     │        │  joins users→display_name       │
│                                │        │  (collectors_export resolution) │
│  writes public/data/notes.json│◄───────┤  writes notes.json              │
└──────────────┬─────────────────┘        └──────────────────────────────┘
               │ S3 publish (never committed) + data/artifacts.toml
               ▼
     deploy.yml build_time_fetch → _data/notes.js (absence-tolerant)
               │
               ▼
     Eleventy build → static species pages (baked notes section)
```

A reader's request traces: static HTML served from CDN → (if author + JS) island calls `GET /api/notes?species=X` for the live re-fetch after writes, and `POST/PATCH/DELETE /api/notes[/<id>]` for mutations, all through `require_author` → SQLite. The nightly path is entirely separate: `run.py` → `notes_harvest.py` → `notes.json` → S3 → `deploy.yml` build-time fetch → `_data/notes.js` → Nunjucks render.

### Recommended Project Structure
```
api/
├── main.py              # add note routes here (existing @app.post/@app.get pattern)
├── notes.py             # NEW: route handler functions (mirrors main.py's inline style,
│                         #      OR extracted if main.py is getting long — planner's call)
data/
├── notes_store/
│   ├── models.py         # add body_html column + author_id FK (existing file)
│   ├── render.py         # NEW: shared render_note_markdown(body_md) -> body_html
│   │                     #      (imported by both api/ and the harvest script)
│   └── migrations/versions/
│       └── 0003_add_body_html_author_fk.py   # NEW forward-only migration
├── notes_harvest.py       # NEW: build-time notes.json producer (mirrors species_export.py)
├── run.py                 # insert ("notes-harvest", export_notes_step) AFTER
│                           # ("collectors-export", ...) per D-12
├── artifacts.toml          # add [artifacts.notes] authoritative entry
_data/
└── notes.js                # NEW: absence-tolerant loader, exact mirror of species_hosts.js
_pages/
└── species-detail.njk       # extend the notes <section>; mount point for the island
src/
├── notes-island.ts           # NEW: Lit component, the D-01 hydrating island
└── entries/taxon-page.ts      # import '../notes-island.ts'
```

### Pattern 1: markdown-it-py restricted subset (render side)
**What:** Instantiate with the `"zero"` preset (everything off) and explicitly enable only the rules the restricted-markdown requirement needs.
**When to use:** Every note create/edit, server-side only, exactly once (D-04).
**Example:**
```python
# Source: markdown-it-py official docs (https://markdown-it-py.readthedocs.io/en/latest/using.html)
from markdown_it import MarkdownIt

# "zero" preset disables everything (including raw HTML passthrough, which is
# disabled by default in ALL presets anyway — markdown-it-py never emits
# raw <script> etc. unless html=True is explicitly set, which we never do).
_md = MarkdownIt("zero").enable([
    "emphasis",     # *italic* / **bold**
    "link",         # [text](url)
    "paragraph",    # blank-line-separated paragraphs
    "list",         # - / 1. lists
])

def render_markdown(body_md: str) -> str:
    return _md.render(body_md)
```

### Pattern 2: nh3 sanitize (defense-in-depth on the rendered HTML, D-06)
**What:** Run the markdown-it-py output through `nh3.clean()` with an explicit tag/attribute/scheme allowlist, even though the renderer already can't emit `<script>` — D-06 requires sanitize-on-write independent of what the renderer alone guarantees (defense in depth: a future renderer change or plugin should not become a silent XSS hole).
**Example:**
```python
# Source: nh3 signature confirmed from github.com/messense/nh3 src/lib.rs (ground truth)
import nh3

_ALLOWED_TAGS = {"p", "em", "strong", "a", "ul", "ol", "li"}
_ALLOWED_ATTRS = {"a": {"href"}}

def sanitize_html(raw_html: str) -> str:
    return nh3.clean(
        raw_html,
        tags=_ALLOWED_TAGS,
        attributes=_ALLOWED_ATTRS,
        url_schemes={"http", "https"},
        # link_rel defaults to "noopener noreferrer" — satisfies D-06 automatically;
        # do NOT also pass "rel" in `attributes["a"]` (nh3 raises ValueError if you do
        # while link_rel is set — verified in source).
    )

def render_note_markdown(body_md: str) -> str:
    """The ONE shared render+sanitize entrypoint — import this from both
    api/ (writes) and data/ (harvest, if ever needed) — never duplicate."""
    return sanitize_html(render_markdown(body_md))
```

### Pattern 3: New note routes on the existing `require_author` template
**What:** Follow `api/main.py`'s `/api/write-check` shape exactly — `@auth.require_author` decorator supplies `g.identity` (server-derived `{uid, login, role}`); never trust a client-supplied `author_id`.
**Example:**
```python
# Source: api/main.py (existing, verified in this repo) — the exact template
@app.post("/api/notes")
@auth.require_author
def create_note():
    identity = g.identity  # {uid, login, role} — server-derived, never from body
    body = request.get_json(silent=True) or {}
    canonical_name = body.get("canonical_name")
    body_md = body.get("body_md", "")
    # ... validate canonical_name against known species (recommend a check
    # against species.json or at minimum non-empty), length-limit body_md,
    # render_note_markdown(body_md) -> body_html, INSERT Note(status='approved',
    # author_id=identity["uid"], ...), INSERT NoteRevision(action='create', ...).
    ...

@app.patch("/api/notes/<int:note_id>")
@auth.require_author
def edit_note(note_id):
    identity = g.identity
    # Load note; abort(404) if missing; abort(403) if note.author_id != identity["uid"]
    # (D-08 — ownership check, NOT curator override, which is Phase 180).
    ...

@app.delete("/api/notes/<int:note_id>")
@auth.require_author
def delete_note(note_id):
    identity = g.identity
    # Same ownership check; sets status='removed'; appends NoteRevision(action='remove').
    ...

@app.get("/api/notes")
def list_notes_for_species():
    # PUBLIC read (no @require_author) — D-02's read endpoint for the live island.
    # MUST still scope to status='approved' server-side (CONTEXT.md discretion item).
    canonical_name = request.args.get("species", "")
    ...
```

### Pattern 4: Alembic batch-mode migration adding a NOT NULL column + FK (SQLite)
**What:** `render_as_batch=True` is already set globally in `env.py` (confirmed) — every migration in this store uses batch mode automatically. The `0002_add_users_table.py` migration is the exact template for a **new table**; the `body_html` migration is different because it **alters an existing table with existing rows**.
**When to use:** Adding `body_html` (and wiring `author_id` → `users.id` FK) to the already-populated `notes` table.
**Example:**
```python
# Source: data/notes_store/migrations/versions/0002_add_users_table.py (existing pattern,
# adapted for an ALTER instead of a CREATE — SQLite/Alembic batch-mode specifics below)
def upgrade() -> None:
    with op.batch_alter_table("notes") as batch_op:
        # Step 1: add as NULLABLE first — SQLite's batch ALTER recreates the table
        # via a temp-table copy; a NOT NULL column with no default would fail on
        # existing rows during that copy.
        batch_op.add_column(sa.Column("body_html", sa.Text, nullable=True))

    # Step 2: backfill existing rows. Import the render helper here (not at module
    # level) to avoid a migrations-dir → notes_store circular import at Alembic
    # discovery time; existing rows have body but no body_html yet.
    from notes_store.render import render_note_markdown
    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id, body FROM notes")).fetchall()
    for note_id, body_md in rows:
        html = render_note_markdown(body_md)
        conn.execute(
            sa.text("UPDATE notes SET body_html = :html WHERE id = :id"),
            {"html": html, "id": note_id},
        )

    # Step 3: NOW tighten to NOT NULL (batch mode again — SQLite can't ALTER
    # COLUMN in place).
    with op.batch_alter_table("notes") as batch_op:
        batch_op.alter_column("body_html", nullable=False)

    # author_id -> users.id FK: notes.author_id is currently a String (D-07's
    # 0001 migration predates users.id existing). If keeping author_id as the
    # internal integer id per D-08, this migration ALSO needs to change its
    # type from String to Integer and add the FK constraint — batch mode
    # handles both via table recreation, but requires a data cast, not just a
    # schema change, if any rows already exist with a non-integer author_id
    # (verify how many, if any, real notes have been written before this
    # migration runs — likely zero, since WRITE-04 only just gated open).
    with op.batch_alter_table("notes") as batch_op:
        batch_op.alter_column("author_id", type_=sa.Integer, existing_type=sa.String)
        batch_op.create_foreign_key(
            "fk_notes_author_id_users", "users", ["author_id"], ["id"]
        )


def downgrade() -> None:
    raise NotImplementedError(
        "forward-only migrations only — no downgrade path (Pitfall 4)."
    )
```
**SQLite/Alembic batch-mode gotchas (verified against `env.py`'s own docstring + this repo's migration history):**
- Batch mode recreates the whole table via `CREATE TABLE ... AS SELECT` + rename — this is why `render_as_batch=True` is required at all (SQLite doesn't support most `ALTER TABLE` forms directly).
- A `NOT NULL` column added to a table with existing rows **must** either carry a `server_default` or be added nullable-then-backfilled-then-tightened (the three-step pattern above) — adding `nullable=False` directly to `add_column` on a non-empty table fails at the INSERT…SELECT step.
- Adding a `FOREIGN KEY` constraint via batch mode is supported, but **only if every existing value in the referencing column already satisfies the constraint** — if any pre-existing `notes.author_id` values don't correspond to a `users.id` row, the batch recreation will fail. Given writes only just opened (178-08, 2026-07-04), this is very likely a non-issue, but the migration should be written defensively (check row count/values first, or wrap in a try/except with a clear error).
- `render_note_markdown` importing inside `upgrade()` (not at module top) avoids a potential circular-import ordering issue between the migrations package and `notes_store.render` at Alembic's module-discovery time — this repo's existing migrations only import `sqlalchemy`/`alembic.op` at module level, so following that convention is safest.

### Pattern 5: The hydrating island — independent auth fetch, not `<bee-header>` coupling
**What:** `_pages/species-detail.njk` uses `layout: default.njk`, which already mounts `<bee-header>` **and** `<script type="module" src="/src/entries/bee-header.ts">` (the auth controller that calls `fetchWhoami()` and sets `header.authState`). `taxon-page.ts` is a **separate Vite entry chunk** that only imports the `bee-header` **component** (`../bee-header.ts`) for its custom-element registration side effect — it does NOT share module state with `entries/bee-header.ts`'s controller.
**Why this matters:** The notes island must NOT try to read auth state off the `<bee-header>` DOM element (e.g. polling its `.authState` property) — there's no guaranteed ordering between when `entries/bee-header.ts`'s `mountAuthController()` resolves `fetchWhoami()` and when the notes island itself initializes, since they're two independently-loaded `<script type=module>` tags. Instead, the notes island should call `fetchWhoami()` **itself** (from `auth-client.ts`, already fire-and-forget/never-throws) — cheap, avoids a race, and matches this repo's existing “each mounting controller owns its own whoami fetch” pattern (see `entries/bee-header.ts`'s own docstring: "the standalone-page auth controller... owns the whoami fetch... for every non-map page").
**Example:**
```typescript
// src/notes-island.ts — sketch
import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { fetchWhoami, type AuthState } from './auth-client.ts';

@customElement('notes-island')
export class NotesIsland extends LitElement {
  @property({ attribute: false }) canonicalName = '';
  @property({ attribute: false }) bakedNotes: Array<{id: number; html: string; byline: any; created: string}> = [];
  @state() private _authState: AuthState | null = null;
  @state() private _liveNotes: typeof this.bakedNotes | null = null; // D-02: overrides baked once fetched

  connectedCallback() {
    super.connectedCallback();
    void fetchWhoami().then((s) => { this._authState = s; });
  }
  // render(): if _authState?.isAuthor, show "Add note" + per-own-note edit/delete;
  // always render (this._liveNotes ?? this.bakedNotes) as the stacked list.
}
```
**Mount data:** Mirror the existing `seasonality-viz` inline-script pattern (`_pages/species-detail.njk` line 97-101) to pass `sp.canonical_name` and the baked notes array into the custom element without a second network round trip:
```njk
<notes-island id="notes-el"></notes-island>
<script>customElements.whenDefined('notes-island').then(function(){
  var el = document.getElementById('notes-el');
  el.canonicalName = {{ sp.canonical_name | dump | safe }};
  el.bakedNotes = {{ (notes[sp.canonical_name] or []) | dump | safe }};
});</script>
```

### Anti-Patterns to Avoid
- **Don't render markdown in the browser.** D-04 is explicit: exactly one renderer, in Python. Shipping `markdown-it` (the JS port) or any client-side markdown lib to render `body_md` in the island would violate this and double the XSS attack surface.
- **Don't trust `<bee-header>`'s DOM state for auth in the island** (Pattern 5 above) — call `fetchWhoami()` independently.
- **Don't add `body_html` as NOT NULL in one step** on a non-empty SQLite table via Alembic batch mode — will fail the table-recreation INSERT if any existing row would violate it (Pattern 4).
- **Don't fold the harvest into `species_export.py`.** D-09 and the ordering constraint (D-12: harvest needs `collectors_export`'s login→display_name/collector-page set, which itself runs *after* `species-export` in `run.py`'s current STEPS order) require a **separate script that is a distinct STEP after `collectors-export`**, not a function tacked onto `export_species_parquet()`.
- **Don't let `nh3.clean()`'s `attributes` allowlist include `"rel"` on `<a>`** while also relying on the default `link_rel` — nh3's own constructor raises `ValueError` if you do both (verified in source); pick one (recommended: leave `attributes["a"] = {"href"}` and let `link_rel` default handle `rel`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Restricted-markdown parsing | A regex-based bold/italic/link stripper | `markdown-it-py` zero-preset + rule allowlist | CommonMark edge cases (nested emphasis, escaped brackets, link title syntax) are exactly what hand-rolled regex parsers get wrong, and get wrong in ways that are also security-relevant (e.g. `[text](javascript:...)`). |
| HTML sanitization | A custom tag-stripping regex/string-replace | `nh3` (Ammonia) | HTML sanitization to an allowlist is a canonically hard problem (mutation XSS, attribute-based vectors, malformed-tag parsing) — this is exactly the class of problem OWASP/Ammonia-style dedicated libraries exist for. |
| Ownership/ACL check | A new "is this my note" helper reinventing session parsing | `g.identity["uid"] == note.author_id`, reusing `api/auth.py`'s already-tested `require_author`/`require_session` | The identity/session verification is already built, tested, and hardened (fresh allowlist recheck, Origin check, launch gate) — the only new logic per route is the one-line ownership comparison. |
| Byline name resolution | A second `display_name` computation keyed off `users.inat_login` | Re-derive via the exact `collectors_export.py` `_QUERY` COALESCE (`arg_max(recordedBy, year) FILTER (...) ELSE '@'||login`) | D-11/`feedback_reuse_display_name_resolution` — a second name system was explicitly rejected by the user. |

**Key insight:** Every piece of this phase that looks like it needs new security-sensitive code (parsing, sanitizing, authorizing) already has either a battle-tested library (markdown-it-py/nh3) or an already-shipped, already-tested BeeAtlas module (`api/auth.py`) to reuse. The genuinely new code is thin: route handlers, one migration, one harvest script, one Lit component.

## Common Pitfalls

### Pitfall 1: `canonical_name` casing/format mismatch between the note store and the site
**What goes wrong:** `notes.canonical_name` is a free-text `String` column (no FK to a species table) — a note created with `"Apis Mellifera"` or trailing whitespace won't match `sp.canonical_name` in `species-detail.njk` (`{%- set hosts = species_hosts[sp.canonical_name] -%}` pattern) or the harvest's `Record<canonical_name, Note[]>` key.
**Why it happens:** The write endpoint accepts `canonical_name` from the client (the island knows it from `sp.canonical_name`, injected server-side at page build time — see Pattern 5's mount snippet), but nothing currently validates or normalizes it against the site's canonical lowercase-genus-species convention (e.g. `"apis mellifera"`, per the existing store test fixtures).
**How to avoid:** The write endpoint should either (a) trust the exact string sent by the island (since it originates from `sp.canonical_name`, already correctly-cased, injected at build time — no user free-text entry of the species name), or (b) validate against a known-species list (`public/data/species.json`) if the endpoint should ever be callable independent of a specific species page. Recommend (a) for v1 — the island is the only writer and always supplies a build-time-correct value — but note this in the plan as a place a future non-island client (e.g. a future admin tool) could get wrong.
**Warning signs:** A note that never appears on its species page despite existing in the DB with `status='approved'`.

### Pitfall 2: bleach's end-of-life makes it a trap for future contributors
**What goes wrong:** bleach is still installable and still shows up first in generic "python html sanitizer" search results/training data; a future contributor (or a future Claude session) could reach for it out of habit.
**Why it happens:** bleach was the de facto standard for years; its Mozilla pedigree makes it look authoritative even now that it's EOL.
**How to avoid:** This RESEARCH.md and the resulting code comments should explicitly note nh3 as the load-bearing choice and bleach as rejected-and-why, mirroring how `api/session.py` documents *why* it avoids PyJWT.
**Warning signs:** A `pip install bleach` appearing in a future diff.

### Pitfall 3: SQLite batch-mode FK creation failing silently-late if pre-existing data violates it
**What goes wrong:** If any `notes` rows exist with an `author_id` that doesn't correspond to a `users.id` (e.g. a test/manual row inserted before Phase 178's `users` table existed, using the old String-typed `author_id`), the `0003` migration's `create_foreign_key` step will fail when Alembic's batch mode tries to recreate the table.
**Why it happens:** SQLite's batch-mode ALTER is implemented as `CREATE TABLE new AS SELECT ... FROM old` + rename; a violated constraint surfaces as a rejected INSERT during that copy, not at `create_foreign_key()` call time.
**How to avoid:** Before writing the migration, check `SELECT DISTINCT author_id FROM notes` against `SELECT id FROM users` in a throwaway copy of the current maderas `notes.db` (or accept that in a fresh/CI DB there are zero rows and the migration is trivially safe — likely the actual production state, since WRITE-04 just gated open on 2026-07-04 with the "first author committed" note in STATE.md, meaning very few or zero real notes exist yet).
**Warning signs:** `alembic upgrade head` fails with an `IntegrityError` during a migration that "should" be additive.

### Pitfall 4: Race between the live-island re-fetch (D-02) and the nightly harvest ordering
**What goes wrong:** None expected functionally (the two paths are independent — the API reads live SQLite; the harvest reads a WAL snapshot nightly), but a plan/verification step could mistakenly assume the island's `GET /api/notes` and the baked `notes.json` must always agree at every instant. They will legitimately diverge for up to 24h (a new note appears live immediately but not in the static bake until the next nightly run) — this is *intended* per D-02/NOTES-04, not a bug.
**Why it happens:** Two independent data paths (live API read vs. nightly-baked static read) with different freshness.
**How to avoid:** Document this explicitly in the plan's acceptance criteria so a verifier doesn't flag "notes.json doesn't have my just-created note yet" as a defect.
**Warning signs:** A UAT/verification step that diffs live-island output against `notes.json` and treats any divergence as a failure.

### Pitfall 5: `notes_harvest.py`'s DB read racing the API's WAL writes
**What goes wrong:** The harvest opens the SQLite file read-only while the API may be concurrently writing (both are already engineered for this — `notes_store/db.py`'s `make_engine()` sets `journal_mode=WAL` specifically "to enable the Phase-179 nightly harvest to open the DB read-only while the app writes concurrently," per its own docstring, D-16). The pitfall is a **new** engine factory in the harvest script accidentally *not* reusing `notes_store.db.make_engine` (e.g. opening the file with a raw `sqlite3.connect()` without WAL pragmas), which could reintroduce a locking issue that WAL mode was specifically added to prevent.
**How to avoid:** The harvest script must call `notes_store.db.make_engine(NOTES_DB_PATH)` (same factory api/main.py uses), not hand-roll its own SQLite connection.
**Warning signs:** Intermittent nightly harvest failures ("database is locked") that don't reproduce in isolation.

## Code Examples

### Byline resolution reuse (D-11) — the harvest side
```python
# Source: data/collectors_export.py _QUERY (lines 45-89, existing/verified) —
# the harvest does NOT re-run this whole query; it needs only login -> display_name
# and login -> "has a collector page" (i.e. appears in collectors.json at all).
# Simplest correct approach: read the ALREADY-WRITTEN public/data/collectors.json
# (produced earlier in the same run.py invocation, since collectors-export runs
# before notes-harvest per D-12) rather than re-deriving display_name from raw
# parquet a second time — one fewer place that could drift from collectors_export's
# own resolution.
import json
from pathlib import Path

def _load_collector_index(assets_dir: Path) -> dict[str, dict]:
    """Return {login: {"display_name": ..., "collector_url": "/collectors/<login>/"}}."""
    collectors_path = assets_dir / "collectors.json"
    if not collectors_path.exists():
        return {}
    records = json.loads(collectors_path.read_text())
    return {
        r["login"]: {
            "display_name": r["display_name"],
            "collector_url": f"/collectors/{r['login']}/",
        }
        for r in records
    }
```
This is the safest way to satisfy D-11 ("no second name system") — it reads `collectors_export.py`'s own output artifact rather than re-implementing the `arg_max(recordedBy, year)` COALESCE logic a second time in a different file, eliminating an entire class of future drift.

### `_data/notes.js` (D-13 — exact mirror of `_data/species_hosts.js`)
```javascript
// Source: _data/species_hosts.js (existing, verified) — copy verbatim, only
// renaming the file/path.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..');
const notesPath = join(repoRoot, 'public/data/notes.json');

let result = {};
if (existsSync(notesPath)) {
  try {
    result = JSON.parse(readFileSync(notesPath, 'utf8'));
  } catch (err) {
    console.warn(`_data/notes.js: WARNING — could not parse ${notesPath} (${err}); returning {}`);
  }
}

export default result;
```

### `data/artifacts.toml` addition (D-09/D-10)
```toml
# Source: data/artifacts.py validate() rules (existing, verified) — authoritative
# artifacts MUST NOT set baseline_diff (the default is false; simply omit the key).
[artifacts.notes]
provenance = "authoritative"
kind = "hashed"
source_file = "notes.json"
hash_basename = "notes"
build_time_fetch = true
# build_time_fetch_optional = true  # consider: true, mirroring species_hosts,
# since pre-first-harvest a fresh checkout/CI build needs _data/notes.js's own
# absence-tolerance regardless — confirm with the deploy.yml fetch-step pattern
# whether build_time_fetch_optional is ALSO needed there, or if _data/notes.js's
# existsSync() guard alone is sufient (species_hosts sets both; investigate why
# during planning by reading .github/workflows/deploy.yml's build-time-fetch step).
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `bleach` for HTML sanitization | `nh3` (Ammonia/Rust binding) | bleach EOL announced 2023-01-23; **final release 2026-06-05** (confirmed via PyPI JSON — no further releases after that date, including security fixes) | Any new Python project should default to `nh3`, not `bleach`, as of this research date. |

**Deprecated/outdated:**
- `bleach`: officially unmaintained as of its 2026-06-05 final release; relies on the also-stalled `html5lib`. Do not add as a new dependency.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `notes.author_id` (currently `String`, D-07's 0001 migration) should be recast to `Integer` and FK'd to `users.id` in the same migration that adds `body_html`, per D-08's "author_id → FK users.id" instruction — CONTEXT.md doesn't specify whether this is the SAME migration as `body_html` or a separate one. | Pattern 4 (migration) | Low — either way is forward-only and additive; splitting into two migrations (0003 = body_html, 0004 = author_id FK) is equally valid and arguably safer (smaller blast radius per migration). Planner should decide split-vs-combined. |
| A2 | The write endpoint trusts the island-supplied `canonical_name` verbatim rather than validating it against `species.json` (Pitfall 1). | Pattern 3 / Pitfall 1 | Low for v1 (only the island writes notes; it always supplies a build-time-correct value) — becomes a real validation gap only if a future non-island client is added (e.g. an admin bulk-import tool), which is out of scope for 179. |
| A3 | `build_time_fetch_optional = true` should probably also be set on the `notes` artifact contract entry (mirroring `species_hosts`), but the exact reason `species_hosts` needs it (vs. relying solely on `_data/species_hosts.js`'s own `existsSync()` guard) wasn't independently re-derived from `deploy.yml` in this research pass — recommend the planner read `.github/workflows/deploy.yml`'s "Fetch build-time data from S3" step during planning to confirm whether the CI/build-time fetch step itself needs this flag to avoid a hard failure on a missing S3 key (as distinct from the Eleventy-side JS loader's own tolerance). | Code Examples / artifacts.toml | Medium if wrong — an under-specified flag here could make the very first post-179-merge CI build fail trying to fetch a `notes.json` key that doesn't exist in the manifest yet (pre-first-nightly-harvest). This is exactly the scenario `build_time_fetch_optional` exists to solve for `species_hosts`, so the parallel is very likely correct, but should be confirmed rather than assumed. |

## Open Questions

1. **Should `POST /api/notes` and the harvest share one Python package, or does the harvest just read pre-derived `collectors.json` (as shown in Code Examples) rather than re-querying DuckDB?**
   - What we know: `collectors_export.py`'s `_QUERY` is DuckDB-specific (reads parquet); the harvest reads a *different* database (SQLite, `notes_store`). The cleanest join is notes-store-side (`users.inat_login`) → `collectors.json`'s already-written `login` key, entirely in Python/JSON, no DuckDB needed in the harvest at all.
   - What's unclear: Whether the planner wants the harvest script to use DuckDB at all (e.g. for query-shaped iteration) or plain SQLite/SQLAlchemy + JSON file reads (simpler, and matches the "harvest reads read-only WAL SQLite" framing better).
   - Recommendation: Plain SQLAlchemy (reusing `notes_store.db.make_engine` + `notes_store.models.Note`) + `json.load()` of `collectors.json` — no DuckDB dependency needed for this script, keeping it simpler than `species_export.py` (which legitimately needs DuckDB for parquet).

2. **Exact REST verb/path for the read endpoint** (`GET /api/notes?species=<canonical_name>` vs. `GET /api/notes/<canonical_name>` vs. some other shape).
   - What we know: CONTEXT.md leaves this to planner's discretion; D-02 only requires "a read endpoint returning a species' approved notes."
   - What's unclear: Whether `canonical_name` (which contains a space, e.g. `"apis mellifera"`) is cleaner as a query param (URL-encoded) or a path segment (needs URL-encoding either way, but query-param avoids Flask route converter edge cases with spaces/slashes in `canonical_name`s that contain a `/` as part of a subgenus-qualified name — verify none do, but query-param is safer regardless).
   - Recommendation: `GET /api/notes?species=<url-encoded canonical_name>` — avoids any path-segment-encoding ambiguity.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `nh3` (PyPI) | Sanitization (D-06) | ✗ (not yet installed) | 0.3.6 latest | Install via `uv add nh3` in `data/pyproject.toml` — no fallback needed, package verified available |
| `markdown-it-py` (PyPI) | Rendering (D-04) | ✗ (not yet installed) | 4.2.0 latest | Install via `uv add markdown-it-py` — no fallback needed |
| Alembic | Migration (D-05) | ✓ (already a `data/pyproject.toml` dependency, `>=1.18.5`) | installed | — |
| SQLAlchemy | Store ORM | ✓ (already a dependency, `>=2.0.51,<3`) | installed | — |
| Flask / flask-cors / Waitress | API routes | ✓ (already deployed, Phase 178) | installed | — |
| Lit | Frontend island | ✓ (`package.json` `"lit": "^3.3.3"`) | installed | — |

**Missing dependencies with no fallback:** none — `nh3`/`markdown-it-py` are simply not-yet-added, both confirmed installable and legitimate.
**Missing dependencies with fallback:** none.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework (Python) | pytest 9.0.2+ (via `uv run pytest`, `data/pyproject.toml`) |
| Framework (JS) | Vitest (`npm test`) |
| Config file (Python) | `data/pyproject.toml` `[tool.pytest.ini_options]` (testpaths includes `../api/tests`) |
| Config file (JS) | `vitest` config embedded in `vite.config.ts` / `package.json` (existing, unchanged) |
| Quick run command (Python) | `cd data && uv run pytest tests/test_notes_*.py ../api/tests/test_notes_routes.py -x` |
| Quick run command (JS) | `npm test -- notes-island` |
| Full suite command | `cd data && uv run pytest` (deselects `integration` by default) + `npm test` |

### Phase Requirement → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NOTES-01 | Allowlisted author creates a note; restricted-markdown rendered + sanitized; byline+timestamps attached | unit (API route) | `uv run pytest api/tests/test_notes_routes.py::test_create_note_renders_and_sanitizes -x` | ❌ Wave 0 |
| NOTES-01 | `render_note_markdown()` strips disallowed tags/rescheme's links | unit | `uv run pytest data/tests/test_notes_render.py -x` | ❌ Wave 0 |
| NOTES-02 | Non-owner PATCH/DELETE is 403; owner PATCH/DELETE succeeds | unit (API route) | `uv run pytest api/tests/test_notes_routes.py::test_edit_delete_ownership -x` | ❌ Wave 0 |
| NOTES-02 | DELETE is a soft-delete (`status='removed'` + `note_revisions` row), row survives | unit | `uv run pytest data/tests/test_notes_store_schema.py::test_soft_delete -x` (extend existing file) | ❌ (extend existing file) |
| NOTES-03 | Harvest emits `notes.json` matching the D-13 shape, `approved`-only, newest-first | unit | `uv run pytest data/tests/test_notes_harvest.py -x` | ❌ Wave 0 |
| NOTES-03 | `_data/notes.js` returns `{}` when file absent/unparseable | unit (JS) | `npm test -- data-notes` | ❌ Wave 0 (mirror `data-species_hosts.test.ts`) |
| NOTES-03 | Species page renders stacked notes list with graceful empty state | component/DOM test | `npm test -- notes-island` | ❌ Wave 0 |
| NOTES-04 | After create/edit/delete, island re-fetches and re-renders before next nightly | component test (mocked fetch) | `npm test -- notes-island` (same file, additional cases) | ❌ Wave 0 |
| (migration) | `body_html` NOT NULL backfilled correctly; `author_id` FK enforced | unit | `uv run pytest data/tests/test_notes_migrations.py::test_migration_0003_backfills_body_html -x` (extend existing file) | ❌ (extend existing file) |

### Sampling Rate
- **Per task commit:** run the specific new/changed test file(s) above.
- **Per wave merge:** `cd data && uv run pytest` (fast tier) + `npm test`.
- **Phase gate:** Full suite green before `/gsd-verify-work`; additionally, per `project_local_dbt_build_not_runnable`, the harvest script itself can be exercised locally against real `notes.db` data (create a tmp SQLite, seed a few notes via the ORM, run the harvest, inspect JSON) since it does NOT depend on the un-runnable-locally dbt build.

### Wave 0 Gaps
- [ ] `data/tests/test_notes_render.py` — covers `render_note_markdown()` (markdown-it-py + nh3 pairing), including an XSS-payload-is-inert case (`<script>alert(1)</script>` and `[x](javascript:alert(1))` both survive as inert text/stripped, per D-06)
- [ ] `data/tests/test_notes_harvest.py` — covers the new harvest script's JSON shape, ordering, approved-only filter, byline join
- [ ] `api/tests/test_notes_routes.py` — covers create/edit/delete/read routes (mirrors `api/tests/test_routes.py`'s existing fixture style: `client`, `_base_env`, `tmp_engine`, `_mint`, `_allowlist_toml`)
- [ ] `src/tests/notes-island.test.ts` — covers hydration gating on `fetchWhoami()`, the D-02 re-fetch-after-write behavior, and the empty-state rendering rule
- [ ] Extend `data/tests/test_notes_migrations.py` with a `0003` backfill test (mirrors the existing `test_migration_applies` pattern, targeting the new revision explicitly)
- [ ] Extend `data/tests/test_notes_store_schema.py` with soft-delete + `note_revisions` append-only assertions

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (reused, not new) | `api/session.py`'s `itsdangerous` signed cookie (already shipped, Phase 178) — no new auth code in 179 |
| V3 Session Management | yes (reused) | `api/auth.py require_session`/`require_author` (already shipped) |
| V4 Access Control | yes (NEW logic in 179) | Server-derived `g.identity["uid"] == note.author_id` ownership check on PATCH/DELETE — this is the one genuinely new authz check this phase adds |
| V5 Input Validation | yes (NEW) | `markdown-it-py` restricted rule-set (structural validation) + note length/rate limits (planner's discretion per CONTEXT.md) |
| V6 Cryptography | no new surface | No new secrets/tokens introduced in 179 |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Stored XSS via note body (malicious markdown/HTML in `body_md`) | Tampering / Elevation of Privilege | Sanitize-on-write (`nh3.clean()` allowlist) + render pre-sanitized HTML only, never re-parse client-supplied HTML on read (D-04/D-06) |
| `javascript:`/`data:` URI in a note link | Tampering | `nh3.clean(url_schemes={"http","https"})` — explicit scheme allowlist, verified in the library's own signature |
| IDOR — editing/deleting another author's note by guessing/enumerating `note_id` | Elevation of Privilege | Server-derived `g.identity["uid"] == note.author_id` check on every PATCH/DELETE (Pattern 3) — never trust a client-supplied identity, consistent with 178's `require_author` invariant |
| CSRF on note-mutation endpoints | Spoofing / Tampering | Already covered by `require_author`'s Origin allow-list check on all state-changing verbs (POST/PUT/PATCH/DELETE) — no new CSRF surface, the decorator already gates these methods |
| Markdown-based DoS (pathological nested-emphasis input causing catastrophic parser backtracking) | Denial of Service | `markdown-it-py` (a hand-written recursive-descent-style CommonMark parser, not a naive backtracking regex engine) is not known to have ReDoS-class issues the way some regex-based markdown parsers historically have; still recommend a body-length cap (CONTEXT.md leaves this to planner's discretion) as defense-in-depth |

## Sources

### Primary (HIGH confidence)
- This repo's own source, read directly: `api/main.py`, `api/auth.py`, `api/session.py`, `api/config.py`, `api/users.py`, `api/tests/test_routes.py`, `api/tests/conftest.py`, `data/notes_store/models.py`, `data/notes_store/db.py`, `data/notes_store/roles.py`, `data/notes_store/migrations/env.py`, `data/notes_store/migrations/versions/0001_initial_schema.py`, `data/notes_store/migrations/versions/0002_add_users_table.py`, `data/tests/test_notes_store_schema.py`, `data/tests/test_notes_migrations.py`, `data/species_export.py`, `_data/species_hosts.js`, `_pages/species-detail.njk`, `_pages/collector-detail.njk`, `data/collectors_export.py`, `data/artifacts.toml`, `data/artifacts.py`, `docs/adr/0002-derived-vs-authoritative-artifacts.md`, `src/auth-client.ts`, `src/tests/auth-client.test.ts`, `src/entries/taxon-page.ts`, `src/entries/bee-header.ts`, `src/bee-header.ts`, `_layouts/default.njk`, `data/run.py`, `data/pyproject.toml`, `.planning/config.json`
- PyPI JSON API (`https://pypi.org/pypi/<pkg>/json`) — verified current versions/release dates for `nh3` (0.3.6, 2026-06-22), `bleach` (6.4.0, final release 2026-06-05), `markdown-it-py` (4.2.0, 2026-05-07), `mistune` (3.3.2, 2026-06-23)
- `messense/nh3` GitHub source (`src/lib.rs`, fetched directly) — ground-truth `clean()`/`Cleaner` signature and defaults (`link_rel="noopener noreferrer"` default, the `rel`-attribute-conflict `ValueError`)
- `slopcheck install nh3 markdown-it-py --ecosystem pypi` (run in an isolated scratch venv) — both `[OK]`

### Secondary (MEDIUM confidence)
- WebSearch: bleach EOL announcement/history, nh3-as-successor narrative (cross-verified against the PyPI release-date evidence above, which independently confirms the 2026-06-05 final release)
- WebFetch of `markdown-it-py` official docs (`using.html`) — `"zero"` preset + `.enable([...])` pattern, safe-by-default (`html: False`) confirmation
- pypistats.org recent-downloads API for `nh3` (~47.5M/month) — endpoint did not return data for `markdown-it-py` (hyphenated package name); GitHub org reputation (ExecutableBooks) used as the secondary signal instead

### Tertiary (LOW confidence)
- None — every claim above was cross-verified against at least one primary/secondary source; no purely-WebSearch-only claims remain unflagged.

## Metadata

**Confidence breakdown:**
- Standard stack (markdown-it-py + nh3): HIGH — verified via PyPI registry, official GitHub source, and slopcheck
- Architecture (routes/migration/island/harvest shape): HIGH — every pattern is a direct extension of already-shipped, already-tested code in this repo (Phase 178's `api/`, Phase 177's `notes_store`, Phase 175's `species_hosts` bake)
- Pitfalls: MEDIUM-HIGH — the SQLite batch-mode FK/backfill pitfalls are verified against this repo's own `env.py` docstring and Alembic's documented batch-mode behavior, but the exact pre-existing-row state on maderas (Pitfall 3) was not directly queried (no access to the live `notes.db`) — flagged as a pre-migration check for the planner/executor to perform

**Research date:** 2026-07-04
**Valid until:** 30 days (stable domain — Flask/SQLAlchemy/Alembic/Lit are all mature; the markdown-it-py/nh3 pairing is unlikely to see breaking changes in this window; re-verify PyPI versions if planning is delayed past early August 2026)

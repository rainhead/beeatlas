# Phase 179: Notes Feature + Harvest → Build-Time Bake - Pattern Map

**Mapped:** 2026-07-04
**Files analyzed:** 13
**Analogs found:** 12 / 13

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `data/notes_store/render.py` (NEW) | utility | transform | none exact — small pure helper | no analog |
| `api/main.py` (extend: note CRUD + read routes) | controller/route | CRUD + request-response | `api/main.py` `/api/write-check` + `/auth/whoami` (same file) | exact |
| `api/notes.py` (NEW, optional split) | controller/route | CRUD + request-response | `api/main.py` route style | role-match |
| `data/notes_store/models.py` (extend: `body_html`, `author_id` FK) | model | CRUD | itself (existing `Note`/`NoteRevision`/`User`) | exact |
| `data/notes_store/migrations/versions/0003_*.py` (NEW) | migration | batch (schema transform) | `data/notes_store/migrations/versions/0002_add_users_table.py` | exact (but CREATE→ALTER shape differs) |
| `data/notes_harvest.py` (NEW) | service (build-time script) | batch / file-I/O | `data/species_export.py` (+ `data/collectors_export.py` for the join) | role-match |
| `data/run.py` (extend: STEPS list) | config/orchestrator | batch | itself — existing `STEPS` tuple list | exact |
| `data/artifacts.toml` (extend: `[artifacts.notes]`) | config | — | `[artifacts.species_hosts]` block | exact (adapted derived→authoritative) |
| `_data/notes.js` (NEW) | utility (Eleventy data loader) | file-I/O | `_data/species_hosts.js` | exact |
| `src/bee-notes.ts` (NEW) | component (Lit island) | request-response + CRUD | `src/species/seasonality-viz.ts` (light-DOM pattern) + `src/auth-client.ts` (fetch pattern) | role-match |
| `_pages/species-detail.njk` (extend: notes `<section>` + mount) | template | request-response (SSR) | itself — `collected-from` block (lines ~60-72) + `seasonality-viz` mount script (lines ~97-101) | exact |
| `src/entries/taxon-page.ts` (extend: import `bee-notes.ts`) | config (Vite entry) | — | itself | exact |
| Tests (`api/tests/test_notes_routes.py`, `data/tests/test_notes_*.py`, `src/tests/bee-notes.test.ts`) | test | — | `api/tests/test_routes.py`, `data/tests/test_notes_store_schema.py`, `data/tests/test_notes_migrations.py` | exact |

## Pattern Assignments

### `data/notes_store/render.py` (utility, transform) — NO ANALOG

No existing pure-Python markdown/sanitize helper exists in this repo. Follow RESEARCH.md's Pattern 1/2 verbatim (`markdown-it-py` "zero" preset + explicit rule allowlist, then `nh3.clean()` with an explicit tag/attribute allowlist). Place it in `data/notes_store/` (not `api/`) since `api/main.py` already imports from `notes_store.*` (see below) — this requires no new cross-package wiring, and the (not-yet-existing) harvest script can import the same module if it ever needs to re-render.

**Existing cross-package import precedent** (`api/main.py` lines 47-49):
```python
from notes_store import roles as roles_module
from notes_store.db import make_engine
```
Mirror this shape for the render helper: `from notes_store.render import render_note_markdown`.

---

### `api/main.py` (route additions) + `api/notes.py` (controller, CRUD/request-response)

**Analog:** `api/main.py` itself — `/api/write-check` (lines 303-321) and `/auth/whoami` (lines 268-290).

**Imports pattern** (lines 33-49, already in `api/main.py` — new note routes reuse the same imports, no new import block needed beyond `notes_store.render` and the ORM session/engine helpers):
```python
from flask import Flask, abort, g, jsonify, redirect, request
import api.auth as auth
import api.config as config
from notes_store import roles as roles_module
from notes_store.db import make_engine
```

**Auth/ownership pattern** (`/api/write-check`, lines 303-321 — the exact template for create/edit/delete):
```python
@app.post("/api/write-check")
@auth.require_author
def write_check():
    identity = g.identity
    role = _fresh_role(identity["login"])
    return jsonify({"uid": identity["uid"], "login": identity["login"], "role": role})
```
For edit/delete, extend this shape with an ownership check (`api/auth.py`'s docstring is explicit: "Author identity for the wrapped view must come from `flask.g.identity`... never from request body/query data"):
```python
@app.patch("/api/notes/<int:note_id>")
@auth.require_author
def edit_note(note_id):
    identity = g.identity
    note = ...  # load; abort(404) if missing
    if note.author_id != identity["uid"]:
        abort(403)
    ...
```

**Public read pattern** (`/auth/whoami`, lines 268-290 — the template for a route with NO `@auth.require_author`, still returning JSON via `jsonify`):
```python
@app.get("/auth/whoami")
def whoami():
    token = request.cookies.get(session.COOKIE_NAME)
    ...
    return jsonify({...})
```
`GET /api/notes?species=<name>` should follow this exact no-decorator shape, but MUST still server-side-scope to `status='approved'` (CONTEXT.md discretion item / RESEARCH.md Pattern 3).

**Error handling pattern** (module-level, lines 85-97 — applies automatically to every new route, no per-route try/except needed for unexpected errors):
```python
@app.errorhandler(Exception)
def _handle_unexpected_error(err: Exception):
    if isinstance(err, HTTPException):
        return err
    app.logger.exception("Unhandled exception")
    return jsonify({"error": "internal error"}), 500
```

**`require_author` decorator internals** (`api/auth.py` lines 118-141 — read this, don't copy; note routes just apply `@auth.require_author`):
```python
def require_author(view):
    @wraps(view)
    def author_view(*args, **kwargs):
        login = g.identity["login"]
        if not _is_author_fresh(login):
            abort(403)
        if request.method in _STATE_CHANGING_METHODS:
            if not origin_allowed(request.headers.get("Origin")):
                abort(403)
        if not config.WRITES_ENABLED:
            abort(503)
        return view(*args, **kwargs)
    return require_session(author_view)
```

**Engine pattern** (module-level, line 105 — reuse the SAME lazily-opened engine, do not open a second one):
```python
_ENGINE = make_engine()
```

---

### `data/notes_store/models.py` (model, CRUD) — extend existing file

**Analog:** itself, `Note`/`NoteRevision`/`User` classes (lines 27-89). Add `body_html: Mapped[str] = mapped_column(Text, nullable=False)` to `Note`, and change `author_id` from `String` to `Integer` with `ForeignKey("users.id")`:
```python
author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
```
Follow the existing docstring convention (D-refs in the module docstring at lines 1-15) — add a note explaining the body_html/author_id FK addition and its migration number.

---

### `data/notes_store/migrations/versions/0003_*.py` (migration, batch schema transform)

**Analog:** `data/notes_store/migrations/versions/0002_add_users_table.py` (53 lines, full file read) — but this is a CREATE TABLE migration; the 0003 migration is an ALTER on a populated table, so RESEARCH.md's Pattern 4 (three-step nullable→backfill→NOT-NULL, using `op.batch_alter_table`) must be used instead of `op.create_table`.

**Header/revision-id pattern to copy exactly** (lines 1-27):
```python
"""Add users table: BeeAtlas-internal identity (D-07/D-08).
...
Revision ID: 0002
Revises: 0001
Create Date: 2026-07-04
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None
```
Set `revision = "0003"`, `down_revision = "0002"`.

**Forward-only downgrade pattern** (lines 48-53 — copy verbatim, this is load-bearing):
```python
def downgrade() -> None:
    raise NotImplementedError(
        "forward-only migrations only — no downgrade path. "
        "The authoritative notes store has no upstream to rebuild from; "
        "a downgrade that drops tables is unrecoverable (Pitfall 4)."
    )
```

**Batch-mode ALTER template:** use RESEARCH.md's Pattern 4 code block verbatim (three-step `add_column(nullable=True)` → backfill loop calling `notes_store.render.render_note_markdown` (imported inside `upgrade()`, not at module level, per the existing migrations' convention of only importing `sqlalchemy`/`alembic.op` at module level) → `alter_column(nullable=False)`, then a separate `batch_alter_table` for the `author_id` type change + `create_foreign_key`).

---

### `data/notes_harvest.py` (service, build-time batch/file-I/O)

**Analog 1 — build-time JSON emit shape:** `data/species_export.py` (lines 1-60, 467-479 read).

**Module docstring + path-resolution pattern** (lines 1-42):
```python
import os
from pathlib import Path

DB_PATH = os.environ.get('DB_PATH', str(Path(__file__).parent / 'beeatlas.duckdb'))
_default_assets = str(Path(__file__).parent.parent / 'public' / 'data')
ASSETS_DIR = Path(os.environ.get('EXPORT_DIR', _default_assets))
```
For the harvest, the DB path is the notes store, not `beeatlas.duckdb` — use `notes_store.db.make_engine` (see Pitfall 5 in RESEARCH.md: do NOT hand-roll a raw `sqlite3.connect()`).

**`main()` entrypoint pattern** (lines 467-479):
```python
def main() -> None:
    """Build ... from beeatlas.duckdb."""
    print("Connecting to DuckDB...")
    con = duckdb.connect(DB_PATH)
    ...
    print("Done.")

if __name__ == "__main__":
    main()
```
The harvest's `main()` should follow this same print/connect/emit/close shape but using SQLAlchemy (`notes_store.db.make_engine`) instead of DuckDB — RESEARCH.md's Open Question 1 recommends plain SQLAlchemy + reading the already-written `collectors.json`, no DuckDB dependency needed.

**Analog 2 — byline join (D-11, reuse not rebuild):** `data/collectors_export.py` lines 45-89 (`_QUERY`) — do NOT re-run this DuckDB query. Per RESEARCH.md's Code Examples section, read the ALREADY-WRITTEN `public/data/collectors.json` (produced earlier in the same `run.py` invocation, since `collectors-export` runs before the new `notes-harvest` step):
```python
import json
from pathlib import Path

def _load_collector_index(assets_dir: Path) -> dict[str, dict]:
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
The specific COALESCE this ultimately derives from is `data/collectors_export.py` lines 53-56 (`arg_max(recordedBy, year) FILTER (...) ELSE '@' || login`) — cited for context only; the harvest does not re-implement it.

---

### `data/run.py` (STEPS list extension)

**Analog:** itself — the `STEPS` list (line 99 onward) and the `collectors-events-export` entry (line 138) plus its import (line 57):
```python
from collectors_events_export import export_collectors_events_step
...
STEPS: list[tuple[str, Callable]] = [
    ...
    ("collectors-events-export", export_collectors_events_step),
    ...
]
```
Insert `("notes-harvest", export_notes_step)` immediately AFTER `("collectors-events-export", ...)` (D-12 — harvest needs the collectors.json login set), and add `from notes_harvest import main as export_notes_step` (or an appropriately named step function) alongside the other step imports (lines 38-59). Also update the module docstring's STEPS listing (lines 6-13) to include the new step name — this repo's convention keeps the docstring order in sync with the real list.

---

### `data/artifacts.toml` (`[artifacts.notes]` entry)

**Analog:** `[artifacts.species_hosts]` (lines 106-113) — nearest structurally, but provenance flips derived→authoritative per D-09:
```toml
[artifacts.species_hosts]
provenance = "derived"
kind = "hashed"
source_file = "species_hosts.json"
hash_basename = "species_hosts"
baseline_diff = true
build_time_fetch = true
build_time_fetch_optional = true
```
The `notes` entry must be `provenance = "authoritative"` and MUST NOT set `baseline_diff` (per RESEARCH.md's Code Examples section quoting `data/artifacts.py`'s validate() rule: "authoritative artifacts MUST NOT set `baseline_diff`"). Confirm `build_time_fetch_optional` need against `.github/workflows/deploy.yml`'s fetch step per RESEARCH.md Assumption A3 before finalizing.

---

### `_data/notes.js` (absence-tolerant Eleventy loader)

**Analog:** `_data/species_hosts.js` — EXACT mirror per D-13, copy verbatim only renaming the file/path (RESEARCH.md Code Examples section has the full file text):
```javascript
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

---

### `src/bee-notes.ts` (Lit light-DOM component, request-response + CRUD)

**Analog 1 — light-DOM pattern:** `src/species/seasonality-viz.ts` (lines 1-55 read):
```typescript
import { LitElement, html, svg, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('seasonality-viz')
export class SeasonalityViz extends LitElement {
  @property({ attribute: false }) data: number[] = new Array(12).fill(0);
  @property({ attribute: false }) onChecklist = false;

  protected createRenderRoot(): HTMLElement {
    return this;
  }
  ...
}
```
`<bee-notes>` copies the `createRenderRoot(): HTMLElement { return this; }` override verbatim (UI-SPEC.md is explicit this is load-bearing: it lets the component's Lit-rendered markup share `.notes-section`/`.note-list`/`.note`/`.note-body`/`.note-meta` CSS classes with the Nunjucks-baked markup).

**Analog 2 — independent auth fetch (do NOT couple to `<bee-header>`):** `src/auth-client.ts` lines 24-44 (`fetchWhoami`, already fire-and-forget/never-throws):
```typescript
export async function fetchWhoami(): Promise<AuthState> {
  try {
    const res = await fetch(`${API_BASE}/auth/whoami`, { credentials: 'include' });
    if (!res.ok) return { authenticated: false };
    ...
  } catch {
    return { authenticated: false };
  }
}
```
`bee-notes.ts` calls this itself in `connectedCallback()` (RESEARCH.md Pattern 5 / UI-SPEC.md "Auth gating" section) — never poll `<bee-header>`'s DOM state.

**Analog 3 — API_BASE + credentials:'include' convention** (`src/auth-client.ts` lines 9-11, reuse the same constant/module for note CRUD fetches, extending `auth-client.ts` or adding sibling functions in the same file):
```typescript
const API_BASE = (import.meta.env.VITE_NOTES_API_BASE_URL as string | undefined)
  ?? 'https://api.beeatlas.net';
```

---

### `_pages/species-detail.njk` (notes `<section>` + `<bee-notes>` mount)

**Analog 1 — conditional-render block to structurally mirror:** the `collected-from` block, lines 60-72:
```nunjucks
{%- set hosts = species_hosts[sp.canonical_name] -%}
{%- if hosts and hosts.length > 0 -%}
<section class="collected-from">
  <h2>Collected from</h2>
  ...
</section>
{%- endif -%}
```
UI-SPEC.md's Layout Contract section already gives the exact target Nunjucks for the notes section (`{%- set notesForSpecies = notes[sp.canonical_name] -%}` ... `{{ note.html | safe }}` ...) — use that block verbatim, it is the authoritative render contract, not just an analog.

**Analog 2 — inline-script data-handoff mount pattern:** the `seasonality-viz` mount, lines 97-101:
```nunjucks
<script>customElements.whenDefined('seasonality-viz').then(function(){
  var el = document.getElementById('sviz');
  el.data = {{ sp.month_histogram | dump | safe }};
  el.onChecklist = {{ sp.on_checklist | dump | safe }};
});</script>
```
`<bee-notes>`'s mount script (already specified verbatim in UI-SPEC.md's Layout Contract) follows this exact `customElements.whenDefined(...).then(...)` + `document.getElementById(...)` + `{{ ... | dump | safe }}` shape.

**New Nunjucks filter needed:** `formatDate` (UI-SPEC.md notes none exists yet apart from `quantify`) — add to `eleventy.config.js` alongside the existing `quantify` filter registration (grep `eleventy.config.js` for `addFilter("quantify"` to find the exact registration call to mirror).

---

### `src/entries/taxon-page.ts` (Vite entry registration)

**Analog:** itself — the existing 13-line file:
```typescript
import '../index.css';
import '../styles/taxon-pages.css';
import '../bee-header.ts';
import '../species/seasonality-viz.ts';
```
Add `import '../bee-notes.ts';` as a fourth import — no other change needed (Vite plugin-vite MPA mode auto-discovers the entry from the page's `<script type="module">` tag per the file's own header comment).

---

### Tests

**API route tests — analog:** `api/tests/test_routes.py` + `api/tests/conftest.py` (fixture style: `client`, `_base_env`, `tmp_engine`, `_mint`, `_allowlist_toml` — per RESEARCH.md's Wave 0 Gaps list). New file `api/tests/test_notes_routes.py` should reuse these exact fixtures, not redefine them.

**Store/schema tests — analog:** `data/tests/test_notes_store_schema.py` (existing) — extend with soft-delete + `note_revisions` append-only assertions rather than creating a new file.

**Migration tests — analog:** `data/tests/test_notes_migrations.py` (existing `test_migration_applies`-style pattern) — extend with a `0003` backfill test targeting the new revision explicitly.

**Harvest test — no existing analog file**, but structurally mirrors `data/tests/test_species_hosts_export.py` if that file exists (grep confirms naming convention `test_<name>_export.py`); new file `data/tests/test_notes_harvest.py`.

**JS data-loader test — analog:** `src/tests/data-species_hosts.test.ts` (per RESEARCH.md reference) — new file `src/tests/data-notes.test.ts`, exact mirror.

**Component test — no existing analog** for a hydrating auth-gated island with CRUD; closest precedent is `src/tests/seasonality-viz.test.ts` (light-DOM Lit component testing pattern) plus `src/tests/auth-client.test.ts` (mocked-fetch pattern) combined — new file `src/tests/bee-notes.test.ts`.

## Shared Patterns

### Auth/ownership gate (backend)
**Source:** `api/auth.py` `require_author` (lines 118-141) + `require_session` (lines 94-115)
**Apply to:** every new POST/PATCH/DELETE route in `api/main.py`/`api/notes.py`
```python
def require_author(view):
    @wraps(view)
    def author_view(*args, **kwargs):
        login = g.identity["login"]
        if not _is_author_fresh(login):
            abort(403)
        if request.method in _STATE_CHANGING_METHODS:
            if not origin_allowed(request.headers.get("Origin")):
                abort(403)
        if not config.WRITES_ENABLED:
            abort(503)
        return view(*args, **kwargs)
    return require_session(author_view)
```
Ownership (author_id == g.identity["uid"]) is new logic each route adds on top of this — the decorator only proves "is a currently-allowlisted author," not "owns this specific note."

### Global error handling (backend)
**Source:** `api/main.py` lines 85-97 (`_handle_unexpected_error`)
**Apply to:** all new routes automatically (no per-route try/except needed for unexpected exceptions) — only add explicit `abort(4xx)` calls for expected conditions (404 missing note, 403 ownership, 400 bad body).

### Absence-tolerant `_data/*.js` loader
**Source:** `_data/species_hosts.js` (full file, see `_data/notes.js` section above)
**Apply to:** `_data/notes.js` — copy verbatim, only path changes. Keeps `npm run dev`/`npm test`/CI green pre-first-nightly (D-13).

### Forward-only Alembic migrations
**Source:** `data/notes_store/migrations/versions/0002_add_users_table.py` (both `upgrade()`/`downgrade()`)
**Apply to:** `0003_*.py` — the `downgrade()` `raise NotImplementedError(...)` body is copied verbatim across every migration in this store; never write a real downgrade.

### Build-time script → `run.py` STEP registration
**Source:** `data/run.py` lines 56-57 (import) + line 138 (STEPS entry)
**Apply to:** `data/notes_harvest.py`'s registration — one import line + one STEPS tuple, inserted immediately after `collectors-events-export`.

### Authoritative vs. derived artifact contract
**Source:** `data/artifacts.toml` `[artifacts.species_hosts]` (derived, lines 106-113) vs. the `notes` entry (authoritative, per D-09) — see `docs/adr/0002-derived-vs-authoritative-artifacts.md` for the underlying invariant (`authoritative` ⇒ never dbt, `baseline_diff` omitted/false, forward-only, never committed).

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `data/notes_store/render.py` | utility | transform | No existing markdown-render/HTML-sanitize helper anywhere in this repo; follow RESEARCH.md Patterns 1/2 directly (verified library APIs, not a codebase analog) |
| `src/bee-notes.ts` (CRUD-mutation half specifically — the create/edit/delete fetch calls, as opposed to the light-DOM/auth-fetch halves which DO have analogs) | component | CRUD | No existing Lit component in this repo performs authenticated POST/PATCH/DELETE from the browser; `src/auth-client.ts` only covers GET (whoami) + auth-flow redirects. New CRUD fetch functions should be added to `auth-client.ts` or a new `notes-client.ts` sibling module following its existing `credentials:'include'` + try/catch-to-safe-default conventions, but the CRUD shape itself is new. |

## Metadata

**Analog search scope:** `api/`, `data/notes_store/`, `data/` (pipeline scripts + `run.py` + `artifacts.toml`), `_data/`, `_pages/`, `src/` (Lit components, `entries/`, `auth-client.ts`), `data/notes_store/migrations/versions/`
**Files scanned:** `api/main.py`, `api/auth.py`, `data/notes_store/models.py`, `data/notes_store/migrations/versions/0002_add_users_table.py`, `data/species_export.py`, `data/collectors_export.py`, `data/run.py`, `data/artifacts.toml`, `_data/species_hosts.js` (via RESEARCH.md), `_pages/species-detail.njk`, `src/auth-client.ts`, `src/entries/taxon-page.ts`, `src/species/seasonality-viz.ts`
**Pattern extraction date:** 2026-07-04

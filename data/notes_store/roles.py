"""Role loader for the BeeAtlas notes store.

Loads the committed allowlist at import time (config.py pattern).
Git history is the audit trail — no ``roles`` table exists in this phase (D-07).

Roles:
  reader  — everyone not in the allowlist; read-only.
  author  — listed as ``"author"``; may create notes.
  curator — listed as ``"curator"``; may take down any note (author implied).

Module-level ``ROLES`` is the parsed ``[roles]`` table from
``data/roles_allowlist.toml``. Monkeypatch it in tests to avoid coupling
test logic to the committed example entries.
"""

import tomllib
from pathlib import Path

_ALLOWLIST = Path(__file__).parent.parent / "roles_allowlist.toml"
with _ALLOWLIST.open("rb") as _fh:
    _CFG = tomllib.load(_fh)

# ``ROLES[login] = "author" | "curator"``; absent login ⇒ reader.
ROLES: dict[str, str] = _CFG.get("roles", {})


def role_of(login: str) -> str | None:
    """Return the explicit role for *login*, or ``None`` if they are a reader."""
    return ROLES.get(login)


def is_author(login: str) -> bool:
    """Return True if *login* may create notes (author OR curator role)."""
    return ROLES.get(login) in ("author", "curator")


def is_curator(login: str) -> bool:
    """Return True if *login* may take down any note (curator role only)."""
    return ROLES.get(login) == "curator"

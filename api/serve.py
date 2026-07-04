"""Waitress serve entrypoint for BeeAtlas's auth + write API (D-17/D-18).

D-17: [Waitress](https://docs.pylonsproject.org/projects/waitress/) — a
maintained, pure-Python WSGI server — serves the app as a persistent
loopback process, reverse-proxied by Apache `mod_proxy_http` at
`api.beeatlas.net`. This REPLACES the previously-considered-and-rejected
FastCGI-bridge deployment shape (see CONTEXT.md D-17 for the rationale).
`ProxyFix` (trusting exactly one Apache hop) lives in `api/main.py`, not
here. Waitress renders no traceback-leaking debug page (unlike the rejected
shape's insecure debug default), but `app.debug` is still forced off here
as belt-and-suspenders (Pitfall 3 restated for Waitress).

D-18: this process is supervised by either a `--user` systemd unit or a cron
`@reboot` entry (the operator's call — confirmed and encoded in 178-08).
This script does not daemonize or manage its own restarts.

Run directly (the form used in production — always sets NOTES_DB_PATH per
Pitfall 5 below):
    python -m api.serve

CLI-equivalent alternative (does NOT apply the Pitfall-5 NOTES_DB_PATH
default below — only use this if NOTES_DB_PATH is already set in the
environment):
    waitress-serve --listen=127.0.0.1:<port> api.main:app
"""

import os
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent
_DATA_DIR = _REPO_ROOT / "data"
for _p in (str(_REPO_ROOT), str(_DATA_DIR)):
    if _p not in sys.path:
        sys.path.insert(0, _p)

# Pitfall 5: the code's built-in NOTES_DB_PATH default (/opt/beeatlas-store/
# notes.db) does not match the real maderas deployment -- maderas has no
# passwordless sudo, so /opt/... was never actually usable (see
# docs/runbooks/notes-store-dr.md). Set the real operator path UNLESS an env
# override is already present (e.g. set by the systemd unit / cron entry) --
# this MUST happen before importing anything that imports notes_store.db,
# since NOTES_DB_PATH is read at that module's import time.
os.environ.setdefault("NOTES_DB_PATH", os.path.expanduser("~/beeatlas-store/notes.db"))

import waitress  # noqa: E402  (must follow the sys.path + NOTES_DB_PATH setup above)

from api.config import SERVE_PORT  # noqa: E402
from api.main import app  # noqa: E402

# Belt-and-suspenders: Waitress itself renders no cgitb traceback page, but
# force Flask's own debug flag off too -- two independent debug flags, both
# must be off (Pitfall 3 restated for Waitress; api/main.py already sets this
# at import time, this is a defense-in-depth restatement at the serve entry).
app.debug = False


def main() -> None:
    # Startup confirmation (flush=True: journald/log files see it even when
    # stdout is block-buffered under a supervisor). No secrets — only the
    # bind address, mode, and store path.
    from api.config import DEV_MODE, REDIRECT_URI

    mode = "DEV" if DEV_MODE else "production"
    print(
        f"beeatlas-api: waitress listening on http://127.0.0.1:{SERVE_PORT} "
        f"[{mode} mode] redirect_uri={REDIRECT_URI} "
        f"store={os.environ['NOTES_DB_PATH']}",
        flush=True,
    )

    # The loopback literal is HARDCODED here -- never 0.0.0.0, never
    # config-driven -- so this process is unreachable except through
    # Apache's reverse proxy (D-17 security posture, T-178-25). Only the
    # port is config-driven (api.config.SERVE_PORT).
    waitress.serve(app, host="127.0.0.1", port=SERVE_PORT)


if __name__ == "__main__":
    main()

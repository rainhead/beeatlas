"""The ONE shared markdown -> sanitized HTML renderer for BeeAtlas notes (D-04/D-06).

``render_note_markdown(body_md)`` is the single server-side entrypoint that both
the write API (``api/main.py``, Phase 179-02) and the nightly harvest
(``data/notes_harvest.py``, Phase 179-03) import — never duplicate this logic.
No markdown-rendering or HTML-sanitization library is ever shipped to the
browser: the client only ever receives (and injects) the resulting trusted
HTML string (D-04).

Two-stage pipeline, both server-side only:
  1. ``markdown_it.MarkdownIt("zero")`` with an explicit rule allowlist
     (emphasis, link, paragraph, list) restricts the input to the small safe
     subset D-03 calls for. The "zero" preset disables every rule by default,
     including raw-HTML passthrough — ``html=True`` is never set, so a literal
     ``<script>``/``<img onerror=...>`` in the source is escaped to inert text
     by the renderer itself.
  2. ``nh3.clean(...)`` (Ammonia's Rust binding) re-sanitizes the rendered HTML
     against an explicit tag/attribute/URL-scheme allowlist. This is
     deliberate defense-in-depth (D-06): the renderer alone already can't emit
     disallowed markup, but a future markdown-it-py plugin or rule change
     should not silently become a stored-XSS hole — nh3 is the independent
     backstop that doesn't depend on the renderer continuing to behave.

Why nh3, not bleach: bleach announced end-of-life 2026-06-05 (final release;
no further releases including security fixes) and depends on the also-stalled
html5lib. nh3 is bleach's maintained, ~20x-faster Rust-backed successor
(mirrors how api/session.py documents avoiding PyJWT in favor of a narrower,
actively-maintained primitive) — see 179-RESEARCH.md Pitfall 2.

Do NOT add "rel" to the nh3 ``attributes`` allowlist for ``<a>`` — nh3's
default ``link_rel="noopener noreferrer"`` already satisfies D-06's
``rel="noopener"`` requirement, and passing both raises ``ValueError``
(verified against nh3's Rust source; see 179-RESEARCH.md Anti-Patterns).
"""

from markdown_it import MarkdownIt
import nh3

# "zero" preset disables everything (including raw HTML passthrough, which is
# disabled by default in ALL markdown-it-py presets anyway unless html=True is
# explicitly set, which we never do). Only enable the rules D-03's restricted
# subset needs.
_md = MarkdownIt("zero").enable(
    [
        "emphasis",  # *italic* / **bold**
        "link",  # [text](url)
        "paragraph",  # blank-line-separated paragraphs
        "list",  # - / 1. lists
    ]
)

# Explicit tag/attribute/URL-scheme allowlist for the sanitize stage (D-06).
_ALLOWED_TAGS = {"p", "em", "strong", "a", "ul", "ol", "li"}
_ALLOWED_ATTRS = {"a": {"href"}}
_ALLOWED_URL_SCHEMES = {"http", "https"}


def render_note_markdown(body_md: str) -> str:
    """Render restricted markdown to sanitized, trusted HTML.

    The ONE shared render+sanitize entrypoint — import this from both
    api/ (writes) and data/ (harvest, if ever needed); never duplicate.

    Args:
        body_md: The author-supplied markdown source (untrusted).

    Returns:
        Sanitized HTML safe to store as ``notes.body_html`` and inject
        directly into the DOM/templates without further escaping.
    """
    raw_html = _md.render(body_md)
    return nh3.clean(
        raw_html,
        tags=_ALLOWED_TAGS,
        attributes=_ALLOWED_ATTRS,
        url_schemes=_ALLOWED_URL_SCHEMES,
        # link_rel defaults to "noopener noreferrer" — satisfies D-06
        # automatically; do NOT also pass "rel" in attributes["a"] (nh3
        # raises ValueError if both are set — verified in source).
    )

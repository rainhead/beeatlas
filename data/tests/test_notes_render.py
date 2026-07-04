"""NOTES-01 render/sanitize unit tests for notes_store.render.render_note_markdown.

Fast-tier (no @pytest.mark.integration) — pure function, no I/O, no database.

Covers the restricted-markdown subset (D-03) and the sanitize-on-render
defense-in-depth (D-06), including the inert-XSS-payload cases required by
this plan's <behavior> block.
"""

from notes_store.render import render_note_markdown


def test_bold_renders_strong():
    assert render_note_markdown("**bold**") == "<p><strong>bold</strong></p>\n"


def test_italic_renders_em():
    assert render_note_markdown("*italic*") == "<p><em>italic</em></p>\n"


def test_link_renders_anchor_with_rel_noopener():
    html = render_note_markdown("[x](https://example.com)")
    assert '<a href="https://example.com" rel="noopener noreferrer">x</a>' in html


def test_javascript_scheme_link_is_dropped():
    """A javascript: URL must never survive as a followable href.

    markdown-it-py's link rule rejects the disallowed scheme outright and
    falls back to rendering the source as inert plain text (no <a> at all),
    which already satisfies "no javascript: href survives"; nh3's
    url_schemes allowlist is the independent backstop (D-06) in case a
    future renderer change ever let a disallowed scheme through as a real
    href.
    """
    html = render_note_markdown("[x](javascript:alert(1))")
    assert "href=" not in html  # no live link was produced at all
    assert 'href="javascript' not in html


def test_script_tag_survives_only_as_inert_text():
    html = render_note_markdown("<script>alert(1)</script>")
    assert "<script" not in html
    assert "</script>" not in html


def test_img_onerror_payload_stripped():
    """No live <img> tag or onerror= attribute survives.

    markdown-it-py (html=False, never enabled) escapes the raw HTML to inert
    text (e.g. "&lt;img ... onerror=alert(1)&gt;"), so "onerror" may still
    appear as plain escaped text — that's fine; what matters is there is no
    unescaped "<img" tag and no live "onerror=" attribute (i.e. it never
    appears unescaped, only inside the escaped/inert form).
    """
    html = render_note_markdown("<img src=x onerror=alert(1)>")
    assert "<img" not in html
    assert "onerror=alert(1)>" not in html  # would indicate a live, unescaped attribute
    assert "&lt;img" in html or "onerror" not in html  # any survival must be inert-escaped text


def test_list_renders_ul_li():
    html = render_note_markdown("- a\n- b")
    assert "<ul>" in html
    assert "<li>a</li>" in html
    assert "<li>b</li>" in html


def test_blank_line_separated_text_renders_paragraphs():
    html = render_note_markdown("para one\n\npara two")
    assert "<p>para one</p>" in html
    assert "<p>para two</p>" in html


def test_disallowed_tags_never_appear():
    """h1/blockquote/img/table/div are all outside the restricted subset."""
    payloads = [
        "# Heading",
        "> quoted",
        "<img src='https://example.com/x.png'>",
        "<table><tr><td>cell</td></tr></table>",
        "<div>raw div</div>",
    ]
    for payload in payloads:
        html = render_note_markdown(payload)
        for tag in ("<h1", "<blockquote", "<img", "<table", "<div"):
            assert tag not in html, f"{tag!r} leaked from payload {payload!r}: {html!r}"


def test_bold_and_link_combination_is_sane():
    html = render_note_markdown("**Apis mellifera** forages on [clover](https://example.com/clover).")
    assert "<strong>Apis mellifera</strong>" in html
    assert '<a href="https://example.com/clover" rel="noopener noreferrer">clover</a>' in html

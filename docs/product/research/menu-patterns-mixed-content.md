# Menu patterns for surfaces that mix actions, links, status and metadata

**Research question:** the BeeAtlas header popover ([`src/bee-header.ts`](../../../src/bee-header.ts),
`.cache-popover.account-popover`) has absorbed several formerly-separate surfaces and now stacks
five different kinds of content — actions, passive status, an external link, build metadata, and an
account identity row — in one flat column. The user's critique: *"There is a little too much visual
irregularity and unclear information hierarchy in this menu."* What do mature design systems say
about (a) the taxonomy of menu row types, (b) how passive status is kept from reading as
interactive, and (c) whether a full-width bordered button belongs inside a dropdown at all?

---

## Summary / recommendation

**The irregularity is not a spacing problem — it is a *row-type* problem. There are currently three
competing visual treatments (bordered button, plain text row, icon+label link) with no rule mapping
treatment to meaning, and the loudest treatment is attached to the least-common content.** Fix it by
collapsing to exactly two row treatments plus one zone divider.

- **Drop the bordered buttons.** No surveyed system renders a bordered/outlined button as a row
  inside a dropdown. Primer, Polaris, Radix and Material all express in-menu actions as *plain full-bleed
  rows* — text (optionally with a leading icon), no border, no radius, differentiated only by a
  hover/active **background** state layer. "Sign out", "Sign in with iNaturalist" and "Source code"
  should become the *same* row treatment. That single change removes most of the irregularity, because
  the link and the actions stop looking like different species.
- **Split the popover into an interactive zone and a passive zone, separated by exactly one
  divider.** Primer's ActionList guidance is explicit: *"When listing selectable items alongside
  non-selectable items in a menu, use dividers to differentiate between the item types."*
  ([Primer ActionList](https://primer.style/components/action-list/)) Today BeeAtlas has 2–3
  hairlines that separate *topics*; it should have one that separates *kinds*. Apple's HIG makes the
  same move at the group level — *"To help people visually distinguish such groups, use a
  separator"* ([Apple HIG, Menus](https://developer.apple.com/design/human-interface-guidelines/menus)).
- **Passive status must be differentiated by color role and by the *absence* of an interaction
  surface, not by a border.** Every system uses a muted secondary foreground for supporting text
  (Material: `on-surface-variant` vs `on-surface`; Primer: `fg.muted`/`fg.subtle` vs `fg.default`).
  Concretely: status rows get `--text-hint`, no hover background, no focus ring, no leading icon in
  the action-icon column, and **no 44px min-height** — the deliberate lack of a touch-sized box is
  itself the signal that it is not a target.
- **At most one emphasized element in the surface, and it is the update notice.** "App update
  available — tap to reload" is a transient promoted action, not a peer of "Sign out". Give it the
  single emphasized treatment (accent-tinted row background at the top of the popover); everything
  else is a plain row. Never two emphasized things at once.
- **Keep `role="dialog" aria-modal="false"`. Do not migrate to `role="menu"`.** The ARIA menu pattern
  admits only `menuitem`/`menuitemcheckbox`/`menuitemradio` children plus `separator`, and
  *"the semantics of descendants of ARIA menuitem elements are not exposed in the accessibility
  tree"* ([APG Menu Button pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/)). A surface
  containing storage figures, a build string and a role badge is structurally disqualified from
  `role="menu"`. The current markup is already correct — this research confirms it rather than
  changes it.
- **Cap the type scale at three sizes and the text-color roles at two.** Header `1rem/600`, row
  `0.875rem/400`, meta `0.75rem`; colors `--text-body` (interactive labels) and `--text-hint`
  (everything passive). Any fourth size or third color is the regression to watch for.

Net effect: one column of visually identical interactive rows, a hairline, then a quiet block of
grey passive text. Hierarchy comes from position, color and the single accent row — not from
borders.

---

## 1. What the mature systems actually publish

Depth here is on **Primer**, **Material 3**, **Radix** and the **W3C APG**, which have the most
directly applicable published guidance. Polaris, Apple HIG, Atlassian and Carbon are cited where
they add something; several of their pages are client-rendered and could not be fully retrieved —
noted inline.

### GitHub Primer — the richest taxonomy

Primer's ActionList is the component behind GitHub's own menus, and it is the only surveyed system
that names a *non-interactive* item type as a first-class concept.

Item taxonomy ([ActionList](https://primer.style/components/action-list/),
[ActionList guidelines](https://primer.style/product/components/action-list/guidelines/)):

| Type | Primer construct | Visual differentiation |
| --- | --- | --- |
| Action item | `ActionList.Item` | plain row, hover/active background |
| Link item | `ActionList.LinkItem` | *same* row treatment as an action; semantics differ, appearance does not |
| Description | `ActionList.Description`, `variant="inline" \| "block"` | secondary text beside or below the label, muted foreground |
| Section header | `ActionList.Group` + `ActionList.GroupHeading` | subtle or filled heading style |
| Divider | `ActionList.Divider`; `showDividers` prop | 1px rule between items or groups |
| Inactive item | `inactiveText` prop | *"will not respond to user input"*; alert icon replaces the leading visual, or occupies the trailing-visual slot if there is none |
| Disabled item | `disabled` | non-clickable, dimmed |
| Destructive | `variant="danger"` | *"a special 'danger' style, to be used in cases that require extra attention"*; *"Place danger items at the end of the list"* |
| Trailing visual / trailing text | `ActionList.TrailingVisual` | *"auxiliary information"* such as status or keyboard shortcuts — *"these side visuals don't have dedicated interaction targets"* |
| Trailing action | `ActionList.TrailingAction` | a genuinely separate control; *"can be keyboard focused individually"* |

Three points matter for BeeAtlas:

1. **Link and action share one treatment.** `LinkItem` is not visually distinguished from `Item`.
   BeeAtlas's "Source code" row (icon + label, `text-decoration: underline` on hover) versus its
   bordered "Sign out" button is a distinction Primer explicitly does not draw.
2. **Status belongs in the trailing slot of a row, or as a description — never as its own borderless
   free-floating paragraph among buttons.** Primer's phrase *"these side visuals don't have
   dedicated interaction targets"* is the whole principle: auxiliary information rides along with a
   row rather than becoming a row.
3. **Inside a menu, explanation text is rendered inline rather than as a control.** Primer notes that
   in menus and listboxes the tooltip/alert affordance is dropped and the explanation is displayed
   *directly within the menu item*, because menu items *"cannot contain button elements."* That is a
   direct argument against a `<button>` styled as a bordered box living inside a menu row.

Primer's [ActionMenu](https://primer.style/components/action-menu) is ActionList + Overlay for
*"quick actions and selections"*, with `role="menu"` on the list. Its documentation shows only
interactive items; **it makes no explicit prohibition on non-interactive content, and I could not
find a sentence stating one** — the constraint is instead enforced by the ARIA role it adopts (see
§7). A surface like BeeAtlas's is an Overlay/dialog, not an ActionMenu.

### Material Design 3

The M3 guideline pages (`m3.material.io/components/menus/*`) are client-rendered and returned no
body text to a plain fetch, so the values below come from the **canonical token source** in
`material-components/material-web`, which is the authoritative implementation of the M3 spec.

From [`tokens/versions/v0_192/_md-comp-list.scss`](https://github.com/material-components/material-web/blob/main/tokens/versions/v0_192/_md-comp-list.scss):

- `list-item-one-line-container-height: 56px`, `two-line: 72px`
- `list-item-leading-space: 16px`, `list-item-trailing-space: 16px`
- `list-item-leading-icon-size: 24px`, `trailing-icon-size: 24px`
- `divider-leading-space: 16px`, `divider-trailing-space: 16px`
- `list-item-label-text-*` → typescale **`body-large`**, color **`md-sys-color.on-surface`**
- `list-item-supporting-text-*` → typescale **`body-medium`**, color **`on-surface-variant`**
- `list-item-trailing-supporting-text-*` → typescale **`label-small`**, color **`on-surface-variant`**
- `list-item-overline-color` → `on-surface-variant`

From [`_md-comp-divider.scss`](https://github.com/material-components/material-web/blob/main/tokens/versions/v0_192/_md-comp-divider.scss):
`thickness: 1px`, `color: md-sys-color.outline-variant`.

The menu-item token set
([`_md-comp-menu-item.scss`](https://github.com/material-components/material-web/blob/main/tokens/_md-comp-menu-item.scss))
supports `one-line-container-height`, `leading-space`, `trailing-space`, `top-space`,
`bottom-space`, `label-text-*`, `supporting-text-*`, `trailing-supporting-text-*`,
`leading-icon-color`, `trailing-icon-color`, and hover/pressed **state-layer color + opacity**, and
sets `container-color: transparent` so items inherit the menu surface.

Two honest caveats: **the menu-item file inherits its heights from the list tokens rather than
overriding them, so material-web's effective one-line menu row is 56px, not the 48dp figure often
quoted** (48dp is the [Material 1 menus spec](https://m1.material.io/components/menus.html) value,
and remains the Android `48dp` minimum touch target); and I could not verify an M3 page that states
a maximum menu width.

The load-bearing lesson from M3 is the **color-role split**: the primary label and the supporting
text are different *semantic roles* (`on-surface` vs `on-surface-variant`), not different sizes of
the same role. And the interactive affordance is a **state layer** — a translucent background on
hover/press — never a border.

### Radix UI — the structural model

[Radix DropdownMenu](https://www.radix-ui.com/primitives/docs/components/dropdown-menu) is the
cleanest statement of the interactive/non-interactive split, because it is enforced by the API:

- `Item`, `CheckboxItem`, `RadioItem` — focusable, keyboard-reachable.
- `Label` — *"non-focusable"*, *"won't be focusable using arrow keys"*; intended for section headers.
- `Separator` — a visual divider between groups; also outside the focus order.
- `Group` — grouping without visual affordance.

It *"adheres to the Menu Button WAI-ARIA design pattern"* with roving tabindex. Note what is absent:
there is no primitive for "a paragraph of status text." Radix's answer to BeeAtlas's content is
implicitly *this is not a dropdown menu* — which is why `role="dialog"` is the right call.

### Shopify Polaris

[ActionList](https://polaris-react.shopify.com/components/lists/action-list) is scoped to
*"secondary or less important information and actions since they're hidden until merchants expose
them by opening a popover."* It supports `items` and `sections`, plus `prefix`, `suffix` and
`helpText` per item, and shows destructive-item examples. Content guidance: items should be *"clear
and predictable"*, each should *"lead with a strong verb"*, and actions should *"be related to each
other."*

`helpText` and `suffix` are Polaris's equivalents of Primer's description and trailing visual — again,
**status attaches to a row, it is not a row**. I found no Polaris sentence forbidding non-interactive
content outright.

### Apple HIG

The HIG pages are client-rendered and did not yield full text to a fetch; the following is from the
[Menus](https://developer.apple.com/design/human-interface-guidelines/menus) guidance as surfaced in
search: *"Consider grouping logically related items"*, and *"To help people visually distinguish such
groups, use a separator. Depending on the platform and type of menu, a separator appears between
groups of items as a horizontal line or a short gap in the menu's background appearance."* Also
*"Prefer keeping all logically related commands in the same group, even if the commands don't all
have the same importance"* — i.e. importance is expressed by *ordering within a group*, not by giving
one item a louder chrome.

Apple's 44×44pt minimum control size is long-standing HIG guidance
([UI Design Do's and Don'ts](https://developer.apple.com/design/tips/)). **I could not retrieve a
sentence in which Apple explicitly forbids non-actionable content in menus; treat any such claim as
unverified.**

### Atlassian and Carbon

Both pages are client-rendered and returned only fragments. Atlassian's
[dropdown menu](https://atlassian.design/components/dropdown-menu/examples) is defined as *"a list of
actions or options"* with item / item-checkbox / item-radio types; **I could not verify its section
or non-interactive-content guidance.** IBM Carbon's
[menu usage](https://carbondesignsystem.com/components/menu/usage/) page could not be retrieved in
usable form. Neither is cited below for any substantive claim.

## 2. The row-type taxonomy, consolidated

Synthesising Primer, Radix and M3, there are six row types and each gets exactly one treatment:

| Row type | Interactive? | In focus order? | Treatment |
| --- | --- | --- | --- |
| Action | yes | yes | plain full-bleed row, label (+ optional 16px leading icon), hover/active background state layer, no border |
| Link | yes | yes | **identical to action** (Primer `LinkItem`); differs only in element + trailing external-link cue if needed |
| Emphasized / promoted action | yes | yes | at most one per surface; accent-tinted background, still full-bleed, still no border |
| Destructive action | yes | yes | danger foreground; placed **at the end** |
| Section heading | no | no (Radix `Label`) | small, muted, uppercase-or-semibold; use only when a group needs naming |
| Passive text (status, description, metadata) | no | **no** | muted foreground role, no hover, no focus ring, no min-height, no border |

## 3. Divider vs section header vs whitespace

The published rules converge:

- **Divider when the *kind* of content changes.** Primer: *"When listing selectable items alongside
  non-selectable items in a menu, use dividers to differentiate between the item types."*
  ([Primer ActionList](https://primer.style/components/action-list/)) This is the exact BeeAtlas case.
- **Divider between items only when rows are visually complex.** Primer's guidelines say item
  dividers are *"useful in complex lists, particularly when descriptions or multi-line text is
  present"*, with the caveat to *"make sure they truly make the presented information easier to
  parse, instead of only increasing visual clutter"*
  ([ActionList guidelines](https://primer.style/product/components/action-list/guidelines/)).
  Three hairlines in a ~200px-tall popover is on the clutter side of that line.
- **Section header when the group needs a *name*.** If a heading would be redundant with its single
  row's own label, use a divider or plain whitespace instead. The current code comment in
  `bee-header.ts` already reaches this conclusion independently ("without adding headings for one-row
  sections") — that instinct is correct; the problem is only that it then uses *several* dividers.
- **Whitespace alone** is sufficient inside a group of homogeneous rows. Primer explicitly prefers a
  divider over whitespace *for group separation* ("use [dividers] instead of whitespace for visual
  clarity"), but whitespace is the default *within* a group.

## 4. The central question — keeping passive status from reading as interactive

No surveyed system says "put a status paragraph in a menu." They say one of three things instead:

1. **Attach the status to a row** — as a description (Primer `Description`, inline or block),
   help text (Polaris `helpText`), supporting text (M3 `supporting-text-*`), or a trailing visual
   (Primer `TrailingVisual` — *"these side visuals don't have dedicated interaction targets"*).
2. **If it must stand alone, mark it non-focusable and style it with the secondary foreground role.**
   Radix's `Label` is *"non-focusable"* and skipped by arrow keys; M3 routes all secondary text
   through `on-surface-variant` rather than `on-surface`.
3. **If there is a lot of it, it isn't a menu.** This is the strongest signal, and it is structural
   rather than prose: the ARIA menu pattern cannot represent it (§7), Radix has no primitive for it,
   and Primer's ActionMenu documents only interactive items. The correct surface for
   "identity + status + actions + metadata" is a **popover/dialog** — which BeeAtlas has already
   chosen.

The practical differentiators, in priority order:

- **Color role** — passive text uses the muted foreground (`on-surface-variant` / `fg.muted`).
- **Absence of a state layer** — no hover or active background. This is the single strongest cue,
  because affordance in modern menus *is* the state layer.
- **Absence of a focus ring / tab stop.**
- **Smaller vertical rhythm** — passive rows are not padded up to a touch target. A 44px-tall row
  reads as tappable; a tight 20px line does not.
- **Position** — grouped together, below the actions, after a divider.

**A note on ✓ / icons:** the "✓ Offline-ready" checkmark is fine on a passive row (M3 puts leading
icons on non-interactive list items too), but it should not occupy the same 16px leading-icon column
that action rows use for their icons, or the two kinds will re-align into one apparent list. Either
give passive rows no icon column, or accept the alignment and rely on color + state layer alone.

## 5. Is a full-width bordered button inside a dropdown an anti-pattern?

**Yes, by convergent evidence — though I found no system that states the prohibition in those
words.** Being precise about what is and isn't verified:

- **Verified:** none of Primer, Material 3, Radix or Polaris renders an in-menu action as a bordered
  or outlined button. All express it as a plain row whose only chrome is a hover/press background.
  M3 makes this explicit at the token level: menu items have `container-color: transparent` and
  hover/pressed **state-layer** tokens, with no border or outline token in the supported set
  ([`_md-comp-menu-item.scss`](https://github.com/material-components/material-web/blob/main/tokens/_md-comp-menu-item.scss)).
- **Verified:** Primer states menu items *"cannot contain button elements"* (in the context of
  inactive-item explanations), and routes secondary interactions through a dedicated
  `TrailingAction` slot rather than an embedded button-looking control.
- **Not verified:** an explicit "do not put an outlined button in a dropdown" rule in any of the
  surveyed docs. The conclusion is inferred from uniform practice plus the M3 token surface, not
  quoted.

What systems do instead:

- **Plain row with an optional leading icon** — the default for all in-menu actions.
- **Emphasis via background tint, not border** — the selected/emphasized state in M3 is
  `selected-container-color` + `selected-label-text-color`; in Primer it is an `active`/`selected`
  background. Borders are reserved for the *surface* (the popover itself), not its rows.
- **A footer action area** — a visually distinct strip at the bottom of the surface *is* an accepted
  place for a real button, but that is a property of dialogs/popovers, not menus, and it should hold
  at most one or two primary actions.

For BeeAtlas: "Sign in / Sign out" is the surface's principal action and can sit as the *first* plain
row of the interactive zone. "App update available — tap to reload" is a promoted, transient
notification and earns the single emphasized (accent-tinted background) row.

## 6. Published token values — comparison

Values are quoted only where I could read them from a primary source. "not verified" means the page
was client-rendered or the value was absent, not that the system lacks the concept.

| Internal | Material 3 (material-web tokens) | Primer | Radix | BeeAtlas today |
| --- | --- | --- | --- | --- |
| Row height (one line) | `56px` (`list-item-one-line-container-height`); M1 menus specified `48dp` | control `medium.size = 32px`; `control.minTarget.coarse = 44px`, `.fine = 16px` | unstyled (no published values) | none — rows are text height (~21px) |
| Row horizontal padding | `16px` leading / `16px` trailing | control `medium.paddingBlock = 6px`; inline padding varies by density | unstyled | none (popover padding only) |
| Icon size | `24px` leading and trailing | not verified (Octicons are 16px in menus) | unstyled | ~16px (inline SVG) |
| Icon→label gap | not verified as a distinct token | `medium.gap.auto = 8px` | unstyled | `6px` |
| Divider thickness / color | `1px` / `md-sys-color.outline-variant` | not verified | unstyled | `1px` / `--border #ddd` |
| Divider inset | `16px` leading and trailing | not verified | n/a | full width of content box |
| Label type / color | `body-large` / `on-surface` | `fg.default` | n/a | `0.875rem/1.5` / `--text-body #213547` |
| Supporting text type / color | `body-medium` / `on-surface-variant` | `fg.muted` | n/a | `0.75rem/1.4` / `--text-hint #767676` |
| Trailing supporting text | `label-small` / `on-surface-variant` | `fg.subtle` | n/a | n/a |
| Hover affordance | state layer (`hover-state-layer-color` + `-opacity`) | background change | consumer-supplied | underline (link) / none (button) |
| Surface | `container-color: transparent` on items; `corner-extra-small` on menu | n/a | n/a | 8px radius, 1px border, 240–320px |

Primer color-role names (`fg.default` / `fg.muted` / `fg.subtle`) are used here as the conceptual
three-tier foreground ladder; **I could not fetch the primitives file with their literal hex values**
(the pattern-token path 404'd), so treat the names as roles, not as verified values. The Primer
size values above *are* verified, from
[`primer/primitives` `functional/size/size.json5`](https://github.com/primer/primitives/blob/main/src/tokens/functional/size/size.json5).

## 7. Accessibility — dialog vs menu

**BeeAtlas's `role="dialog" aria-modal="false"` is correct and should stay.**

- The [ARIA Menu pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menu/) admits only `menuitem`,
  `menuitemcheckbox` and `menuitemradio` children, plus elements with role `separator`. A menu is
  *"a widget that offers a list of choices to the user, such as a set of actions or functions."*
- The [Menu Button pattern](https://www.w3.org/WAI/ARIA/apg/patterns/menu-button/) states the
  disqualifying constraint outright: *"a menuitem widget cannot contain any interactive elements"*,
  and *"the semantics of descendants of ARIA menuitem elements are not exposed in the accessibility
  tree."* Storage figures, a build string, a role badge chip and a username are descendants that must
  remain individually perceivable — so they cannot live under `menuitem`, and a container of them
  cannot be `role="menu"`.
- **Keyboard expectations differ, and this is the practical cost of choosing wrong.** In a `menu`,
  *"Tab and Shift + Tab do not move focus into a `menu`"* — navigation is arrow-key roving focus with
  a single tab stop. In a non-modal dialog, Tab is the expected traversal and every interactive row is
  its own tab stop. BeeAtlas's rows are natural tab stops; forcing the menu pattern would mean
  implementing roving tabindex over a list that is mostly not items. Radix's `Label` being
  *"non-focusable"* and skipped by arrow keys exists precisely to paper over this mismatch.
- **Focus behaviour to implement for the dialog choice:** move focus into the popover on open (the
  first interactive row, or the popover container), keep DOM order = visual order, do **not** trap
  focus (`aria-modal="false"` means the rest of the page stays reachable), close on `Escape` and
  return focus to the trigger button — the same Escape contract the APG specifies for menus, and the
  one users expect from any popover.
- **Target sizing.** [WCAG 2.2 SC 2.5.8 Target Size (Minimum), Level AA](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)
  requires *"at least 24 by 24 CSS pixels"*, with exceptions for spacing, equivalent controls, inline
  targets, user-agent-controlled targets, and essential cases. SC 2.5.5 (Enhanced, AAA) raises this to
  44×44. Apple's HIG asks for 44×44pt, Android/Material for 48dp, and Primer encodes
  `control.minTarget.coarse = 44px`. BeeAtlas's existing 44px dismiss button already meets the
  strictest of these; **interactive rows should be brought to the same 44px min-height, and passive
  rows should deliberately not be** — SC 2.5.8 governs targets, and a non-target has no size floor.

## 8. Principles to adopt

Each of these is checkable by reading the stylesheet or the rendered DOM.

1. **Exactly one visual treatment per row type.** An action row and a link row are the same
   treatment. If two rows in the popover look different, they must be different *kinds*, not
   different *topics*.
2. **No borders on rows.** Border and radius belong to the popover surface only. Row affordance is
   expressed as a hover/active background state layer.
3. **At most one emphasized row per surface**, and it is the update notice. Emphasis = accent-tinted
   background, never an outline.
4. **Passive rows have no hover state, no focus ring, no tab stop, and no min-height.** If a
   `:hover` rule or a `tabindex` can be found on a status or metadata row, the rule is violated.
5. **Exactly two text color roles below the header:** `--text-body` for interactive labels,
   `--text-hint` for every passive string. Accent color is reserved for the emphasized row and the
   focus ring.
6. **At most three type sizes in the popover:** `1rem` header, `0.875rem` row, `0.75rem` meta.
7. **Exactly one divider**, and it separates the interactive zone from the passive zone — not two
   topics of the same kind. Add a second divider only when a *named* section is introduced.
8. **Interactive rows are full-bleed**: they extend to the popover's inner edges (negative inline
   margin against the 16px surface padding) so the hover state reads as a row, not a chip.
9. **Interactive rows have a 44px min-height**; passive rows keep their natural line box.
10. **Content order is fixed by kind, not by feature:** emphasized notice → identity → actions/links
    → divider → status → metadata. New content is placed by asking which kind it is, not where it
    fits topically.
11. **The surface stays `role="dialog" aria-modal="false"`.** Any future proposal to move to
    `role="menu"` requires first removing all passive content.
12. **Destructive actions, if any are ever added, go last** and use a danger foreground — per Primer.

## 9. Proposed token list for BeeAtlas

CSS custom properties scoped to the popover. "Status" says whether the current value already
conforms.

| Token | Proposed value | Derivation | Current BeeAtlas | Status |
| --- | --- | --- | --- | --- |
| `--menu-surface-min-width` | `240px` | — | `240px` | keep |
| `--menu-surface-max-width` | `320px` | — | `320px` | keep |
| `--menu-surface-padding-block` | `8px` | rows carry their own padding once full-bleed | `16px` all round | **change** |
| `--menu-surface-padding-inline` | `16px` | M3 `list-item-leading-space: 16px` | `16px` | keep |
| `--menu-surface-radius` | `8px` | — | `8px` | keep |
| `--menu-surface-border` | `1px solid var(--border, #ddd)` | — | same | keep |
| `--menu-row-min-height` | `44px` | Apple HIG 44pt; Primer `control.minTarget.coarse = 44px`; exceeds WCAG 2.5.8's 24px | none (~21px) | **change** |
| `--menu-row-padding-block` | `10px` | yields 44px with a 0.875rem/1.5 line | `6px` (button only) | **change** |
| `--menu-row-padding-inline` | `16px` | matches surface inline padding so full-bleed rows align | `12px` (button only) | **change** |
| `--menu-row-radius` | `4px` | hover state layer only; the *row* still has no border | `4px` on the button border | repurpose |
| `--menu-row-gap` | `0` | rows are contiguous; whitespace between them is a zone, not a gutter | `8px` flex gap on every child | **change** |
| `--menu-icon-size` | `16px` | Octicon scale, matches 0.875rem text better than M3's 24px | ~16px | keep |
| `--menu-icon-gap` | `8px` | Primer `control.medium.gap.auto = 8px` | `6px` | **change** |
| `--menu-row-hover-bg` | `rgba(0,0,0,0.05)` | M3 hover state layer (`hover-state-layer-color` @ low opacity) | none | **add** |
| `--menu-row-active-bg` | `rgba(0,0,0,0.09)` | M3 pressed state layer | none | **add** |
| `--menu-row-emphasis-bg` | `color-mix(in srgb, var(--accent) 10%, transparent)` | M3 `selected-container-color` | outlined button | **change** |
| `--menu-row-emphasis-fg` | `var(--accent)` | M3 `selected-label-text-color` | `var(--accent)` | keep |
| `--menu-zone-gap` | `8px` | space above/below the single divider | `8px` `padding-top` | keep |
| `--menu-divider-thickness` | `1px` | M3 `divider thickness: 1px` | `1px` | keep |
| `--menu-divider-color` | `var(--border, #ddd)` | M3 `outline-variant` role | `--border #ddd` | keep |
| `--menu-divider-inset` | `0` (full-bleed) | M3 insets 16px; full-bleed reads more clearly as a *zone* boundary in a 240px surface | full content width | keep |
| `--menu-label-size` | `0.875rem` | M3 `body-large` role, scaled to the app | `0.875rem` | keep |
| `--menu-label-line-height` | `1.5` | — | `1.5` | keep |
| `--menu-label-color` | `var(--text-body, #213547)` | M3 `on-surface` / Primer `fg.default` | `--text-body` | keep |
| `--menu-status-size` | `0.875rem` | M3 `body-medium` role | `0.875rem` | keep |
| `--menu-status-color` | `var(--text-hint, #767676)` | M3 `on-surface-variant` / Primer `fg.muted` | `--text-body` today for status rows | **change** |
| `--menu-meta-size` | `0.75rem` | M3 `label-small` role | `0.75rem` | keep |
| `--menu-meta-color` | `var(--text-hint, #767676)` | `on-surface-variant` | `--text-hint` | keep |
| `--menu-header-size` | `1rem` / `600` | — | `1rem` / `600` | keep |
| `--menu-focus-ring` | `2px solid var(--accent)`, offset `2px` | — | same | keep |

Contrast note: `--text-hint #767676` on `#ffffff` is ≈4.54:1, which clears WCAG AA (4.5:1) for
normal text — but only just. Do not darken the background or lighten this token without re-checking.

## 10. Applied to the BeeAtlas menu

| Content | Recommended treatment |
| --- | --- |
| **"App update available — tap to reload"** | The one emphasized row. Full-bleed, `--menu-row-emphasis-bg` background, `--menu-row-emphasis-fg` label, optional leading refresh icon, 44px min-height, **first** in the popover (above identity) so it reads as a notice. No border, no radius beyond `--menu-row-radius`. |
| **Account identity (username + role badge chip)** | Not a row — a **header block** at the top of the interactive zone. Username at `--menu-header-size`/600 in `--menu-label-color`; the "Author"/"Not an editor" badge stays the existing chip, sitting inline after the name. Non-interactive, no hover, no 44px floor. It is the popover's title, and it can carry the existing `--menu-surface-padding-*`. |
| **"Sign in with iNaturalist" / "Sign out"** | Plain full-bleed action row: `--menu-row-min-height: 44px`, `--menu-label-color` text, 16px leading iNat icon with `--menu-icon-gap`, hover/active background. **Remove the 1px accent border, the 4px radius and the accent text.** First row of the interactive zone, directly under the identity block. |
| **"Source code" (GitHub icon → new tab)** | **Identical treatment to the action rows** — same height, same icon column, same hover background. Drop the hover underline; the row background is the affordance. Optional 16px trailing external-link glyph as a `TrailingVisual`-style cue. Sits immediately after the auth row, still in the interactive zone. |
| **Status: "✓ Offline-ready" / "Caching 44.8 MB of 95.4 MB" / "Data updated 2 hours ago" / "46.0 MB stored on this device" + "of 180 MB available"** | The passive zone, below the single divider. `--menu-status-color` (`--text-hint`) at `--menu-status-size`, no hover, no focus ring, no min-height, tight `line-height: 1.4`. The "of 180 MB available" sub-line becomes `--menu-meta-size` — a *description* under its parent status line, per Primer's block description, indented to the same left edge, not a peer row. Keep the ✓ accent glyph but do not place it in the action rows' icon column. |
| **"Build ffc47ac · 2026-07-18 17:52Z"** | Last line of the passive zone, `--menu-meta-size` / `--menu-meta-color`. No divider above it — it is the same *kind* as the status text, so whitespace alone separates it (a hairline here would violate principle 7). |

Resulting structure — one emphasized row, one header block, two-to-three identical plain rows, one
hairline, then a quiet grey paragraph block. Three type sizes, two text colors, one divider, one
border (the surface's).

## 11. Should the popover have a close (X) button?

**Recommendation: remove it from the account/status menu; keep it on the iOS A2HS instructional
popover. The shell therefore needs a per-instance `dismissible` option, not one global answer.**

### 11.1 What the systems ship

The split is clean and it falls exactly along the menu/popover line:

| Surface | Ships a close control? | Source |
| --- | --- | --- |
| Radix `DropdownMenu` | **No.** Parts are Root, Trigger, Portal, Content, Arrow, Item, Group, Label, CheckboxItem, RadioGroup/RadioItem, ItemIndicator, Separator, Sub — there is no `Close` part | [Radix DropdownMenu](https://www.radix-ui.com/primitives/docs/components/dropdown-menu) |
| Radix `Popover` | **Yes.** `Popover.Close` — *"The button that closes an open popover"* — is a documented part, and the component *"Adheres to the Dialog WAI-ARIA design pattern"* | [Radix Popover](https://www.radix-ui.com/primitives/docs/components/popover) |
| Primer `ActionMenu` | **No** close control documented; the trigger toggles | [Primer ActionMenu](https://primer.style/components/action-menu) |
| Primer `Overlay` | Exposes `onEscape`, `onClickOutside`, `initialFocusRef` and a **required** `returnFocusRef`; **no close-button guidance either way**. Primer calls Overlay *"an internal component… intended to be used as a private API"* | [Primer Overlay](https://primer.style/components/overlay) |
| Material 3 menu | not verified — the M3 pages are client-rendered and returned no body text, and the material-web menu token set contains no close-affordance token | — |
| Polaris `ActionList` / Popover | not verified for close-button guidance | — |

The reasoning the split encodes: **a menu is a transient extension of its trigger.** The trigger is
still on screen, still in the tab sequence, and still toggles — so it *is* the close control, and a
second one is redundant. A popover is a small dialog that may hold arbitrary content the user is
meant to read or work through, so an explicit exit is warranted.

Apple states the rule most directly, and it is the most useful sentence found in this round:

> **"Use a Close button for confirmation and guidance only.** A Close button, including Cancel or
> Done, is worth including if it provides clarity, *like exiting with or without saving changes.*
> Otherwise, a popover generally closes when people click or tap outside its bounds or select an item
> in the popover."

([Apple HIG, Popovers](https://developer.apple.com/design/human-interface-guidelines/popovers))

**VERIFIED 2026-07-18 by direct fetch in a real browser** (Playwright/Chromium renders the
client-side content that plain HTTP fetches miss). The wording above is verbatim, superseding the
earlier secondhand-excerpt caveat.

**Correction to the first reading of this sentence.** The clause the excerpt cut off — *"like exiting
with or without saving changes"* — is Apple's own gloss on what qualifies, and it is
confirmation-flavored: it is about **unsaved work**, not about instructional content. Reading
"guidance" as covering the A2HS how-to popover is therefore **plausible but not clearly Apple's
intent**, and this doc previously overstated it ("'Guidance' is precisely what the A2HS popover is").
The A2HS recommendation in §11.6 now rests mainly on the reasoned cost-of-accidental-dismissal
argument, which is explicitly an inference, not on this sentence.

### 11.1a The finding that outranks the close-button question — popovers in compact views

The same page's iOS/iPadOS platform section says, unprompted by our question:

> **"Avoid displaying popovers in compact views.** Make your app or game dynamically adjust its
> layout based on the size class of the content area. **Reserve popovers for wide views; for compact
> views, use all available screen space by presenting information in a full-screen modal view like a
> sheet instead."**

([Apple HIG, Popovers](https://developer.apple.com/design/human-interface-guidelines/popovers) —
verified by direct fetch, same session)

This bears directly on BeeAtlas and was missed in the first pass. The account/status menu is a
popover, and the width that motivated this entire investigation (≤640px, and 320–390px in
particular) is a compact view. Apple's position is that at that width the *surface itself* is wrong —
not that its internal hierarchy needs tuning. A sheet would also dissolve the close-button question,
since sheets carry an explicit dismiss affordance by convention.

Scope limits worth stating: this is Apple's guidance for **iOS/iPadOS native apps**, and BeeAtlas is
a web app whose PWA install target happens to be iOS Safari. Neither Material nor any of the web
design systems surveyed was found to state an equivalent compact-width rule (Material's pages were
unreachable — see honesty flags). Treat this as a strong signal to evaluate, not a settled
cross-platform rule.

Two further sentences from the same page that constrain the menu, both verified in the same fetch:

- *"Always save work when automatically closing a nonmodal popover. People can unintentionally
  dismiss a nonmodal popover by clicking or tapping outside its bounds."* — currently moot (the menu
  holds no user input), but it becomes load-bearing if a note-editing surface ever adopts this shell.
- *"Avoid using a popover to show a warning. People can miss a popover or accidentally close it."* —
  the update-available notice reads as a notice rather than a warning, so this is a boundary to
  respect, not a present violation.

### 11.2 What accessibility specs actually require

Being precise about the three tiers:

- **Required:** Escape closes the surface, focus moves into it on open, and focus returns to the
  invoking element on close. The APG dialog pattern lists *"Escape: Closes the dialog"* as keyboard
  interaction, and *"When a dialog closes, focus returns to the element that invoked the dialog"*
  ([APG Dialog Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)). BeeAtlas already
  implements Escape.
- **Strongly recommended, not required:** *"It is strongly recommended that the tab sequence of all
  dialogs include a visible element with role `button` that closes the dialog, such as a close icon
  or cancel button"* (same source). Two qualifiers matter here: it says *recommended*, not required;
  and it is written for the **modal** dialog pattern, where the trigger is inert and unreachable. In
  a non-modal anchored popover the trigger remains visible, focusable and toggling — so the
  "visible element with role button that closes the dialog" requirement is *already satisfied by the
  trigger itself*. **That reading is my inference, not a quoted APG statement** — the APG does not
  address the anchored-non-modal case explicitly, and I could not find a page that does.
- **Not applicable:** WCAG 2.2 **SC 1.4.13 Content on Hover or Focus** does not govern this. It
  applies where *"receiving and then removing pointer hover or keyboard focus triggers additional
  content to become visible and then hidden"* — its Dismissible requirement is about hover/focus
  triggers, not click-activated popovers
  ([Understanding SC 1.4.13](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html)).
  **I found no WCAG success criterion at any level that requires a visible close control on
  click-triggered non-modal content.** SC 2.1.2 No Keyboard Trap is satisfied by the non-modal
  behaviour plus Escape.

So: Escape + outside-click + a toggling trigger + focus return is **specification-sufficient** for a
non-modal `role="dialog"`. A visible X is a usability decision, not a compliance one.

### 11.3 Touch and mobile — where the two popovers diverge

This is the axis that actually decides the question, and the evidence is uneven — Apple has an
opinion, Material's pages were unreachable, and I found **no published, quantified guidance on the
discoverability of outside-tap dismissal on phones**; anything asserting a number would be invented.
What can be said:

- Apple treats outside-tap as the *normal and expected* popover dismissal on touch ("generally closes
  when people click or **tap** outside its bounds"), so outside-tap is not considered an obscure
  gesture in its own right.
- Apple nonetheless recommends **against popovers in compact views** at all: *"Avoid displaying
  popovers in compact views… for compact views, use all available screen space by presenting
  information in a full-screen modal view like a sheet instead."* This is a nudge that a
  reading-heavy popover on a phone is already at the edge of the pattern — reinforcing that the
  instructional A2HS surface, not the menu, is the one needing extra care.
- Apple carves out exactly one class for an explicit Close: *"confirmation and guidance."*

The decisive difference between BeeAtlas's two surfaces is **the cost of an accidental dismissal**:

- **Account/status menu** — cost is near zero. The trigger is immediately adjacent and re-opening is
  one tap. No content is lost. Outside-tap is the right and only dismissal.
- **A2HS instructions** — cost is high and the failure mode is specific. The user must *read* three
  numbered steps and then act **outside the app's own UI**, on Safari's share button in the browser
  chrome. A tap aimed at (or near) that chrome is plausibly the very tap that dismisses the popover
  they are still reading from. An explicit X lets them dismiss deliberately when done, and makes the
  surface feel like something to be read rather than something to be brushed away. **This
  reach-for-Safari-chrome-dismisses-the-instructions failure is reasoned, not documented** — no
  source states it.

### 11.4 If a close button is kept: where, and does it force a header row?

- **Trailing in a header row is correct** and matches every surveyed dialog implementation, including
  the [APG dialog example](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/dialog/)
  (which includes close buttons but, notably, **offers no rationale for them and says nothing about
  touch users** — I checked). Do not float the X over content or place it at the bottom.
- **It does force a header row** — an X needs a title to sit beside, or it reads as a stray glyph.
  This is a real argument for *removing* it from the account menu: §10 recommends the account
  identity (username + role badge) become the popover's header block, and a 44×44 X trailing that
  block puts a second interactive control in a row whose job is to be a title. Removing the X lets
  the identity block be a pure, non-interactive header — one fewer competing element in exactly the
  region the user called visually irregular.
- **Keep 44×44 if kept.** The existing dismiss already meets Apple's 44pt and Primer's
  `control.minTarget.coarse = 44px`, well above WCAG 2.2 SC 2.5.8's 24×24 minimum.

### 11.5 Concrete recommendation for BeeAtlas

| Surface | Close button | Header row | Rationale |
| --- | --- | --- | --- |
| **Account/status menu** | **Remove** | Yes, but as the non-interactive identity block from §10 — no title string, no X | Menu-shaped, anchored to a visible toggling trigger; Escape + outside-click already implemented; Radix/Primer menus ship no Close; Apple reserves Close for "confirmation and guidance". Removing it also unblocks the §10 header-block recommendation. |
| **iOS A2HS instructions** | **Keep**, trailing a titled header row | Yes — "Add to Home Screen" title + X | Apple's explicit "guidance" carve-out; high cost of accidental dismissal; the user's next action is in Safari's chrome, outside the popover. |
| **Cache detail popover** (folded into the account menu today) | n/a — retired | n/a | Absorbed into the account/status menu. |

**Shell change:** `.cache-popover` should take a per-instance option rather than hardcoding the
header. Suggested shape — `dismissible: boolean` (renders the X) and `heading?: string` (renders the
title). The account menu passes neither and supplies its own identity block as the first child; the
A2HS popover passes both. This also removes the current oddity where three surfaces with different
jobs are forced into one header shape.

**Unchanged either way:** Escape closes and returns focus to the trigger; outside-click closes;
focus moves into the popover on open; `aria-modal="false"` with no focus trap. Those are the parts
the specs actually require, and they are already correct.

### Honesty flags for this section

- ~~Apple HIG popover wording came from **search excerpts, not a successful page fetch**~~ —
  **RESOLVED 2026-07-18.** Fetched directly in a real browser (Playwright/Chromium) and verified
  against the live DOM. The quotes were accurate, but the excerpt had truncated a qualifying clause
  that materially weakened the A2HS argument, and had missed the compact-view rule entirely — see
  §11.1a. Lesson: for client-rendered docs, a search excerpt can be verbatim-correct and still
  mislead by omission; the surrounding paragraph is where the qualifications live.
- **Material 3 and Polaris close-button guidance is unverified**; both pages were unreachable in
  usable form. Neither is cited for any claim above.
- **Primer publishes no close-button guidance either way** for Overlay — that is an observed absence,
  not a documented position.
- The claim that *a visible toggling trigger satisfies the APG's "strongly recommended" close
  control for a non-modal anchored dialog* is **my inference**. The APG's sentence is written for
  modal dialogs and does not address this case.
- The A2HS "reaching for Safari's share button dismisses the instructions" failure mode is
  **reasoned from the interaction, not sourced.**
- **No WCAG SC at any level was found requiring a visible close control on click-triggered non-modal
  content.** That is a search result, i.e. an absence of evidence; it is a strong absence (1.4.13 is
  the criterion that would apply and explicitly does not) but it is not a quoted exemption.

## Open questions / next steps

- **Ordering of the update notice.** Placing it first is the recommendation, but it makes the
  popover's contents shift when an update appears. Worth checking in UAT whether a bottom placement
  (adjacent to the build string it supersedes) reads better; the systems surveyed don't settle it.
- **Verify the Primer foreground hex values** (`fg.default` / `fg.muted` / `fg.subtle`) against the
  primitives package if the exact ladder is wanted; the pattern-token path used here 404'd and only
  the role names are confirmed.
- **Carbon and Atlassian remain unverified** — if a second corroborating source is wanted for the
  "no bordered buttons in menus" inference, those two docs (client-rendered) would need a real
  browser fetch.
- **Dark mode.** `--menu-row-hover-bg` as `rgba(0,0,0,0.05)` assumes a light surface; the popover
  background is hardcoded `#ffffff` today. If a dark theme lands, the state layer needs a
  `color-mix` against the surface rather than a black tint.

---
slug: phr
status: complete
date: 2026-05-18
commit: d6eddf7
---

# Places header and nav icon

## What was done

- `_pages/places.njk`: changed `layout: base.njk` → `layout: default.njk` so the places index gets `<bee-header>`
- `_pages/place-detail.njk`: same layout change so individual place pages get `<bee-header>`
- `src/bee-header.ts`: added map-pin icon (heroicons outline) linking to `/places.html`; active when `window.location.pathname.startsWith('/places')`

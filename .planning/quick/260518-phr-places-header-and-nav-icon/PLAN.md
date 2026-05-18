---
slug: phr
date: 2026-05-18
title: Places header and nav icon
---

Add `<bee-header>` to places pages and a places nav icon to the header.

## Changes

1. `_pages/places.njk` — change `layout: base.njk` → `layout: default.njk`
2. `_pages/place-detail.njk` — change `layout: base.njk` → `layout: default.njk`
3. `src/bee-header.ts` — add map-pin icon linking to `/places.html` after species icon

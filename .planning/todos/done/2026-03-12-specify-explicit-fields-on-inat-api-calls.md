---
created: 2026-03-12T15:27:45.617Z
title: Specify explicit fields on iNat API calls
area: general
files:
  - data/inat/download.py
---

## Problem

`fetch_all()` and `fetch_since()` in `data/inat/download.py` make no `fields` parameter request, relying on the iNat API default response. The default response includes expensive nested data (e.g. full taxon ancestry trees for the community taxon) that we don't use, making each page request significantly slower than necessary.

## Solution

Pass an explicit `fields` parameter to `pyinaturalist.get_observations()` listing only the fields actually consumed by `obs_to_row()`: `id`, `user.login`, `observed_on`, `location`, `ofvs`. This avoids the large taxon ancestry payloads and should meaningfully speed up the ~48-request full fetch.

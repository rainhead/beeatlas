---
title: Nightly resolution-gate blocks the dbt build — dozens of bee names unresolved, --refresh-lineage doesn't clear them
priority: high
source: phase-142-human-verify
created: 2026-06-07
---

During Phase 142 human-verify on maderas, two consecutive `bash data/nightly.sh` runs
aborted at the **resolution-gate** (which runs inside `run.py`, before the dbt build),
exiting non-zero with the EXIT-trap DuckDB/taxa backup firing but no publish.

Observed sequence:
- Run 1: `resolution-gate: 9 bee name(s) unresolved before dbt build`
  (agapostemon, amara, andrena, anthaxia, anthidiellum, anthidium, anthophora,
  ashmeadiella, atoposmia).
- Operator ran the gate's suggested fix `uv run python resolve_taxon_ids.py --refresh-lineage`.
- Run 2: count **grew to 43** unresolved names — now whole genera (bombus, bombylius,
  calliopsis, ceratina, chelostoma, coelioxys, halictus, hylaeus, lasioglossum,
  megachile, melissodes, osmia, perdita, stelis, triepeolus, …) plus Symphyta/other
  outgroups (crossocerus, ectemnius, eristalis, platycheirus, plecoptera, tenthredo, xylota).

So `--refresh-lineage` did not resolve the names — it appears to re-pull fresh taxonomy
and surface MORE unresolved names. The nightly pipeline is currently blocked from
building/publishing until this is fixed.

**Scope note:** This is unrelated to Phase 142 (which only wired the @integration tier
into nightly.sh and hardened the test suite — it never touched taxon resolution or
ingestion). The resolution-gate, the resolver, and the unresolved-name data are
pre-existing pipeline machinery. This is its own operational/pipeline-regression issue.

**Why it matters:** the real nightly cron will abort here every night (no data refresh,
no publish) until resolved. It also blocks the two Phase 142 live-verification items
(block-2b gate firing + steady-state slow tier) since neither can run without a
successful build.

**Where to look:**
- The resolution-gate itself (grep `resolution-gate` — likely in `data/run.py` or a dbt
  pre-build step / `data/dbt/run.sh`).
- `data/resolve_taxon_ids.py` `--refresh-lineage` path — why does it surface more names
  instead of resolving them? Is the unresolved set genus-level names that have no
  species-level taxon_id mapping, or a lineage-refresh regression?
- Whether recent ingestion (iNat obs / ecdysis) introduced genus-only names that the
  resolver can't map.

**Suggested entry point:** `/gsd:debug` — "nightly resolution-gate: dozens of bee names
unresolved, resolve_taxon_ids.py --refresh-lineage grows the set instead of clearing it".

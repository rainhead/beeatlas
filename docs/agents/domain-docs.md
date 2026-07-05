# Domain Docs

How the engineering skills should consume this repo's domain documentation.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — the domain glossary (Specimen, Sample, `tier`/`record_type`, `occ_id`, Collector…).
- **`PRODUCT.md`** — what BeeAtlas is, the two-halves thesis, capabilities, scope.
- **`docs/domain-model.md`** — the deep occurrence data model (five arms, facets, identity rule).
- **`docs/adr/`** — numbered ADRs touching the area you're about to work in.

If any don't exist, **proceed silently** — `/grill-with-docs` creates them lazily.

## File structure (single-context)

```
/
├── CONTEXT.md
├── PRODUCT.md
└── docs/
    ├── domain-model.md
    ├── adr/{0001-…, 0002-…, …}
    ├── lessons-learned.md
    └── concerns.md
```

## Use the glossary's vocabulary

Name domain concepts as `CONTEXT.md` defines them (`tier` vs `record_type` vs the retired `source`; `occ_id`; `is_provisional`; Collector). Don't drift to synonyms it avoids. A missing concept is a signal — either you're inventing language (reconsider) or it's a real gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an ADR, surface it rather than silently overriding:
> _Contradicts ADR 0003 (DuckDB-WASM rejected) — but worth reopening because…_

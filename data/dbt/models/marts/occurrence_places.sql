-- occurrence_places bridge mart: one row per (occ_id, place_slug) membership.
-- Many-to-many replacement for the scalar place_slug formerly carried on the
-- occurrences mart (Phase 160 D-01/D-02). The place ST_Within join now lives ONLY
-- in this bridge file (Phase 160 dropped the with_place/place_dedup CTEs from
-- occurrences.sql). There is no DISTINCT ON collapse here — a point inside the
-- overlap of two places yields one row per place.
--
-- occ_id is the Option-B synthetic canonical occurrence identity (Phase 160 D-discretion
-- "Join key"). The CASE branch order below is POSITIONALLY COUPLED to
-- src/occurrence.ts:23-30 (occIdFromRow): ecdysis_id → observation_id (inat) →
-- specimen_observation_id (inat_obs) → checklist_id. Both ends must use the same
-- priority or the frontend membership join (filter.ts EXISTS clause) will not match;
-- change them together (cf. the _GEO_COLS positional-coupling doc in sqlite_export.py).
--
-- INNER JOIN (not LEFT): an occurrence in no named place simply has zero bridge rows
-- (D-discretion "empty membership" — no sentinel). _row_id is internal scaffolding and
-- MUST NOT appear in the projected output. ORDER BY (occ_id, place_slug) for byte-stable
-- determinism (RESEARCH Pitfall 4).
--
-- Sandbox output path: target/sandbox/occurrence_places.parquet (relative to data/dbt/);
-- external_root from profiles.yml applies (mirrors occurrences.sql:10-17).
{{ config(
    materialized='external',
    location='target/sandbox/occurrence_places.parquet',
    format='parquet',
    options={'CODEC': "'SNAPPY'"}
) }}

WITH joined AS (
    SELECT ROW_NUMBER() OVER () AS _row_id, *
    FROM {{ ref('int_combined') }}
),
occ_pt AS (
    SELECT *, ST_Point(lon, lat) AS pt FROM joined
),
wa_places AS (SELECT * FROM {{ source('geographies', 'places') }}),
with_place AS (
    SELECT occ_pt._row_id, p.slug AS place_slug
    FROM occ_pt
    JOIN wa_places p ON ST_Within(occ_pt.pt, p.geom)
)
SELECT
    CASE
        WHEN j.ecdysis_id IS NOT NULL THEN 'ecdysis:' || j.ecdysis_id
        WHEN j.observation_id IS NOT NULL THEN 'inat:' || j.observation_id
        WHEN j.specimen_observation_id IS NOT NULL THEN 'inat_obs:' || j.specimen_observation_id
        WHEN j.checklist_id IS NOT NULL THEN 'checklist:' || j.checklist_id
    END AS occ_id,
    wp.place_slug
FROM joined j
JOIN with_place wp ON wp._row_id = j._row_id
ORDER BY occ_id, place_slug

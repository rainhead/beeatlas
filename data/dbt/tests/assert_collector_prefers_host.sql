{{ config(severity='error') }}

-- Singular dbt test (Phase 167 fix, 2026-06-28): collector_inat_login must prefer
-- host_inat_login (the floral-host / sample owner = the actual collector) over
-- specimen_inat_login (whoever POSTED the specimen photo to iNat).
--
-- Background: a third party can photograph, post, and ID someone else's pinned specimen
-- on iNat with its WABA catalog field; int_waba_link then matches the Ecdysis specimen to
-- THAT poster's observation, making specimen_inat_login the cataloguer, not the collector.
-- The COALESCE in int_combined.sql was reordered to host_inat_login first to fix this
-- (real example: ecdysis 5595777 "Karen W. Wright" was attributed to login 'rainhead',
-- the specimen photographer/identifier).
--
-- Invariant: whenever a row carries host_inat_login, that login IS the collector. This is
-- guaranteed by COALESCE(host_inat_login, ...) — so the test only fails if the COALESCE
-- order is reverted. PASS semantics: 0 rows.

SELECT
    collector_inat_login,
    host_inat_login,
    record_type
FROM {{ ref('occurrences') }}
WHERE host_inat_login IS NOT NULL
  AND collector_inat_login IS DISTINCT FROM host_inat_login

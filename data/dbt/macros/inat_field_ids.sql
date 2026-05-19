-- Named constants for iNaturalist observation field value (OFV) field IDs.
-- Replaces anonymous integer literals in intermediate models.
-- See: data/dbt/models/intermediate/int_samples_base.sql, int_waba_link.sql, int_combined.sql, int_ecdysis_base.sql

{% macro inat_ofv_specimen_count() %}8338{% endmacro %}
-- field_id = 8338: "Bee Collection: Number of bees collected" — number of specimens in sample

{% macro inat_ofv_sample_id() %}9963{% endmacro %}
-- field_id = 9963: "Bee Collection: Sample ID" — collector's sequential sample number

{% macro inat_ofv_catalog_suffix() %}18116{% endmacro %}
-- field_id = 18116: "Bee Collection: Ecdysis catalog number suffix" — links WABA obs to Ecdysis record

{% macro inat_ofv_host_obs_url() %}1718{% endmacro %}
-- field_id = 1718: "Observation URL" — host plant observation URL on provisional WABA rows

-- Shared CASE expression: returns taxon__name when the observation is a Plantae record,
-- NULL otherwise. Used in int_ecdysis_base.sql and int_samples_base.sql.
-- alias: the SQL table alias for the iNat observations table in the calling model.
{% macro is_plant_taxon(alias) -%}
CASE WHEN {{ alias }}.taxon__iconic_taxon_name = 'Plantae' THEN {{ alias }}.taxon__name ELSE NULL END
{%- endmacro %}

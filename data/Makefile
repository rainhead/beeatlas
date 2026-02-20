.DELETE_ON_ERROR:

gbif-backbone/backbone.zip:
	wget -O '$@' 'https://hosted-datasets.gbif.org/datasets/backbone/current/backbone.zip'

NA_CEC_Eco_level3.zip:
	wget -O '$@' 'https://dmap-prod-oms-edc.s3.us-east-1.amazonaws.com/ORD/Ecoregions/cec_na/NA_CEC_Eco_Level3.zip'

gbif-backbone/taxon.parquet: gbif-backbone/backbone.zip gbif-backbone/taxon.sql
	unzip -p '$<' Taxon.tsv | duckdb -f gbif-backbone/taxon.sql > '$@'

osu_mm/labels-2025.tsv:
	wget -O '$@' 'https://docs.google.com/spreadsheets/d/1lcul17yLdZvd0QmbhUHN-fcDpocsY04v/export?format=tsv'

osu_mm/labels-2025.parquet: osu_mm/labels-2025.tsv osu_mm/labels-2025.sql
	duckdb -f osu_mm/labels-2025.sql < '$<' > '$@'

fieldspec := (id:!t,description:!t,geojson:!t,license_code:!t,time_observed_at:!t,uri:!t,public_positional_accuracy:!t,updated_at:!t,observation_photos:(position:!t,photo:(id:!t,attribution:!t,hidden:!t,license_code:!t,original_dimensions:(height:!t,width:!t),url:!t)),taxon:(id:!t,ancestor_ids:!t),user:(id:!t,login:!t,name:!t))

inat/observation/%.json:
	wget -O '$@' 'https://api.inaturalist.org/v2/observations?fields=$(fieldspec)&id=$(notdir $(basename $@))'

inat/observations.parquet: $(wildcard inat/observation/*.json)
	duckdb

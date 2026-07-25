#!/usr/bin/env bash
#
# Enqueues the iNaturalist export that produces data/raw/inat_expert_obs.csv,
# the source for ARM 4 of int_combined (record_type='inat_expert').
#
# There is no API for the export form, so this replays the browser request.
# Both credentials are session-scoped and expire: open
# https://www.inaturalist.org/observations/export while logged in, copy the
# request as cURL from DevTools, and lift the fresh values.
#
#   COOKIE='_inaturalist_session=...' CSRF_TOKEN='...' ./inat_expert_obs.sh
#
# iNat emails a download link when the export finishes; save the CSV over
# data/raw/inat_expert_obs.csv and commit it. Nothing in the pipeline re-runs
# this — the CSV is a hand-refreshed snapshot.

set -euo pipefail

: "${COOKIE:?set COOKIE to the _inaturalist_session cookie}"
: "${CSRF_TOKEN:?set CSRF_TOKEN to the X-CSRF-Token from the export page}"

# --- Identifiers we trust on Washington bees ---------------------------------
#
# CAVEAT: this is `ident_user_id`, which matches an observation if the person
# has *an* identification on it — not if they agree with the observation's
# community taxon, which is the name the export actually reports and the name
# we ingest. An observation one of these people identified and the community
# then overruled still lands in the CSV under the community's name. Treat the
# roster as "an expert has looked at this", not "an expert vouches for this
# determination".
EXPERTS=(
  johnascher        # John S. Ascher
  nmdg              # Nathaniel Green
  augustjackson     # August Jackson
  lyfisgrand        # Jade Lyf
  swisschick        # Karla Salp
  xianzx            # Xian Zhou
  morcutt           # Michelle Orcutt
  domingozungri     # Domingo Zungri
  hsteig            # Henry Steig
  a_hershey         # Aidan Hersh
  makarii_loskutov  # Makarii Loskutov
  frankhogland      # Frank Hogland
  trevorsless       # Trevor Sless
  susanna_h         # Susanna Heideman
  umt               # Anatole Maugendre
  zportman          # Zach Portman
  csbutrfly12       # Chanda S Bartholomew
  hadel
  ben10101
)

# Joined for the inner query: comma-separated, with the comma percent-encoded
# once because this whole string is itself a query-string value.
ident_user_id=$(IFS=,; printf '%s' "${EXPERTS[*]}")
ident_user_id=${ident_user_id//,/%2C}

# The observation search that defines the expert feed.
QUERY_PARAMS=(
  "quality_grade=any"                   # needs-ID counts; the roster is the filter
  "identifications=any"
  "geoprivacy=open"                     # skip obscured/private coordinates
  "taxon_geoprivacy=open"               #   (both flavours of obscuring)
  "place_id=46"                         # Washington
  "taxon_id=630955"                     # Anthophila (bees)
  "hrank=genus"                         # nothing coarser than genus
  "ident_user_id=${ident_user_id}"
  "acc_below_or_unknown=100"            # positional accuracy <=100 m, or unstated
)
QUERY=$(IFS='&'; printf '%s' "${QUERY_PARAMS[*]}")

# QUERY is nested inside a form field, so it is percent-encoded a second time on
# the way out. Order matters: % must be escaped before the characters that
# produce new % sequences.
form_encode() {
  local s=$1
  s=${s//%/%25}
  s=${s//&/%26}
  s=${s//=/%3D}
  printf '%s' "$s"
}

# Which columns the export includes. Each column appears twice (=0 then =1 to
# select it); left verbatim as captured from the form.
COLUMN_PARAMS='observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bid%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bid%5D=1&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Buuid%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bobserved_on_string%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bobserved_on%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bobserved_on%5D=1&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Btime_observed_at%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Btime_observed_at%5D=1&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Btime_zone%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Buser_id%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Buser_id%5D=1&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Buser_login%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Buser_login%5D=1&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Buser_name%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Buser_name%5D=1&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bcreated_at%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bcreated_at%5D=1&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bupdated_at%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bupdated_at%5D=1&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bquality_grade%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Blicense%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Blicense%5D=1&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Burl%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Burl%5D=1&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bimage_url%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bimage_url%5D=1&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bsound_url%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Btag_list%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bdescription%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bnum_identification_agreements%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bnum_identification_disagreements%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bcaptive_cultivated%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Boauth_application_id%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bplace_guess%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Blatitude%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Blatitude%5D=1&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Blongitude%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Blongitude%5D=1&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bpositional_accuracy%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bprivate_place_guess%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bprivate_latitude%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bprivate_longitude%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bpublic_positional_accuracy%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bgeoprivacy%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Btaxon_geoprivacy%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bcoordinates_obscured%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bpositioning_method%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bpositioning_device%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bplace_town_name%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bplace_county_name%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bplace_state_name%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bplace_country_name%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bplace_admin1_name%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bplace_admin2_name%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bspecies_guess%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bscientific_name%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bscientific_name%5D=1&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bcommon_name%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Biconic_taxon_name%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Btaxon_id%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Btaxon_id%5D=1&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Btaxon_kingdom_name%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Btaxon_phylum_name%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Btaxon_subphylum_name%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Btaxon_superclass_name%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Btaxon_class_name%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Btaxon_subclass_name%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Btaxon_superorder_name%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Btaxon_order_name%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Btaxon_suborder_name%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Btaxon_superfamily_name%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Btaxon_family_name%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Btaxon_subfamily_name%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Btaxon_supertribe_name%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Btaxon_tribe_name%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Btaxon_subtribe_name%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Btaxon_genus_name%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Btaxon_genushybrid_name%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Btaxon_species_name%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Btaxon_hybrid_name%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Btaxon_subspecies_name%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Btaxon_variety_name%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Btaxon_form_name%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bfield%3Aaberrant%2Btype%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bfield%3Aassociated%2Bobservation%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bfield%3Aassociated%2Bspecies%2Bwith%2Bnames%2Blookup%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bfield%3Aassociated%2Bspecies%2Bwith%2Bnames%2Blookup%5D=1&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bfield%3Abuzz-pollination%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bfield%3Ahost%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bfield%3Aid%2Bmeant%2Bfor%2B%2522eater%2522%2Bor%2Borganism%2Bbeing%2Beaten%253F%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bfield%3Ainteraction-%253Eparasite%2Bof%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bfield%3Ais%2Bobservation%2Bone%2Bof%2Bthese%2Bspecial%2Btypes%2Bof%2Bfeeding%253F%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bfield%3Alikely%2Bcause%2Bof%2Bdeath%253F%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bfield%3Anectar%2Bplant%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bfield%3Anumber%2Bof%2Bnests%2Bin%2Bsite%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bfield%3Anumberofspecimens%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bfield%3Aontario%2Btrumpeter%2Bswan%2Bwing%2Btag%2Bnumber%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bfield%3Aplant%2Bspecies%2Bobserved%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bfield%3Apredator%2Bspecies%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bfield%3Apyrobombus%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bfield%3Aqueen%2Bbehavior%2Bobserved%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bfield%3Arobbing%2Bnectar%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bfield%3Asampleid%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bfield%3Asecond%2Bassociated%2Bspecies%2Bwith%2Bnames%2Blookup%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bfield%3Athis%2Borganism%2Bwas%2Bfound%2Binside%252C%2Bright%253F%5D=0&observations_export_flow_task%5Boptions%5D%5Bcolumns%5D%5Bfield%3Aurl%2Bfor%2B%2522partner%2522%2Bobservation%5D=0'

curl 'https://www.inaturalist.org/flow_tasks' \
  --compressed \
  -X POST \
  -H 'Accept: application/json, text/javascript, */*; q=0.01' \
  -H 'Content-Type: application/x-www-form-urlencoded; charset=UTF-8' \
  -H 'X-Requested-With: XMLHttpRequest' \
  -H 'Origin: https://www.inaturalist.org' \
  -H 'Referer: https://www.inaturalist.org/observations/export' \
  -H "X-CSRF-Token: ${CSRF_TOKEN}" \
  -H "Cookie: ${COOKIE}" \
  --data-raw "utf8=%E2%9C%93&observations_export_flow_task%5Binputs_attributes%5D%5B0%5D%5Bextra%5D%5Bquery%5D=$(form_encode "$QUERY")&${COLUMN_PARAMS}&commit=Create+Export"

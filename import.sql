COPY (
  SELECT
    id,
    decimalLongitude,
    decimalLatitude,
    modified,
    sex,
    scientificName,
    family,
    stateProvince,
    county,
    identificationRemarks,
    split_part(recordedBy, ' | ', 1),
    eventDate,
    associatedTaxa->>'$[0].associations[0].verbatimSciname',
    cast(parse_filename(associatedTaxa->>'$[0].associations[0].resourceUrl') as uint32),
    cast(split_part(catalogNumber, '_', 2) as uint32),
    minimumElevationInMeters
  FROM 'ecdysis/occurrences.tsv'
  WHERE starts_with(catalogNumber, 'WSDA_')
) TO 'src/assets/ecdysis.parquet' (FORMAT parquet);

COPY (
  SELECT gbifID,
    license,
    modified,
    "references",
    institutionCode,
    collectionCode,
    catalogNumber,
    recordNumber,
    recordedBy,
    sex,
    eventDate,
    habitat,
    decimalLatitude,
    decimalLongitude,
    coordinateUncertaintyInMeters,
    elevation,
    taxonKey,
    family,
    genus,
    species,
    specificEpithet,
    infraspecificEpithet
  FROM read_csv('gbif-wa-bees/occurrence.txt', types={'scientificNameID': 'VARCHAR'})
  WHERE
    genus IS NOT NULL
    AND coalesce(coordinateUncertaintyInMeters, 0) <= 2000
) TO 'src/assets/gbif.parquet' (FORMAT parquet);

COPY (
  SELECT
    t.taxonID,
    parentNameUsageID,
    canonicalName,
    kingdom,
    phylum,
    "class",
    "order",
    "family",
    taxonRank
  FROM 'backbone/Taxon.tsv' AS t
  JOIN 'backbone/Distribution.tsv' AS d ON d.taxonID = t.taxonID
  WHERE
    (family IN ('Apidae', 'Colletidae', 'Halictidae', 'Andrenidae', 'Megachilidae', 'Melittidae')
      OR phylum='Tracheophyta')
    AND taxonomicStatus='accepted'
    AND d.countryCode in ('US', 'CA')
) to 'src/assets/backbone.parquet' (FORMAT parquet);

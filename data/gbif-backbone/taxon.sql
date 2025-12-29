COPY TO '/dev/stdout'
SELECT taxonID, scientificName, taxonRank, kingdom, family, parentNameUsageID
FROM read_csv('/dev/stdin')
WHERE taxonomicStatus != 'doubtful'
  AND kingdom IN ('Animalia', 'Plantae');

CREATE TABLE taxon (
  taxonID UINTEGER PRIMARY KEY,
  scientificName VARCHAR NOT NULL,
  taxonRank VARCHAR NOT NULL,
  kingdom VARCHAR NOT NULL,
  family VARCHAR,
  parentNameUsageID UINTEGER
);
INSERT INTO taxon (
  SELECT taxonID, scientificName, taxonRank, kingdom, family, parentNameUsageID
  FROM read_csv('/dev/stdin')
  WHERE taxonomicStatus != 'doubtful'
  AND kingdom IN ('Animalia', 'Plantae')
);
COPY taxon TO '/dev/stdout' (FORMAT parquet);

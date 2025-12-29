CREATE TABLE printings (
  fieldNumber uinteger,
  dateLabelPrint date,
  sampleurl varchar,
  decimalLongitude double not null,
  decimalLatitude double not null,
  primary key (fieldNumber, dateLabelPrint)
);
INSERT INTO printings (
  SELECT
    fieldNumber,
    strptime(dateLabelPrint, '%d-%b-%y')::date,
    url,
    decimalLongitude,
    decimalLatitude
  FROM read_csv('/dev/stdin')
);
COPY (
  SELECT
    fieldNumber,
    first(sampleurl ORDER BY dateLabelPrint desc) sampleurl,
    first(decimalLongitude ORDER BY dateLabelPrint desc) decimalLongitude,
    first(decimalLatitude ORDER BY dateLabelPrint desc) decimalLatitude
  FROM printings
  GROUP BY 1
)
TO '/dev/stdout' (FORMAT parquet);

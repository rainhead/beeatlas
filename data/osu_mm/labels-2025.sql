INSTALL spatial;
LOAD spatial;

CREATE TABLE printings (
  fieldNumber uinteger,
  dateLabelPrint date,
  sampleurl varchar,
  location geometry,
  primary key (fieldNumber, dateLabelPrint)
);
INSERT INTO printings (
  SELECT
    fieldNumber,
    strptime(dateLabelPrint, '%d-%b-%y')::date,
    url,
    st_point(decimalLongitude, decimalLatitude)
  FROM read_csv('/dev/stdin')
);
COPY (
  SELECT
    fieldNumber,
    first(sampleurl ORDER BY dateLabelPrint desc) sampleurl,
    first(location ORDER BY dateLabelPrint desc) "location"
  FROM printings
  GROUP BY 1
)
TO '/dev/stdout' (FORMAT parquet);

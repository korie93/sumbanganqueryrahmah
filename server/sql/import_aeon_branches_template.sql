-- AEON branches import helper
-- Usage in psql:
--   \set csv_path 'C:/Users/Administrator/Desktop/sumbanganqueryrahmah/data/aeon_branches_template.csv'
--   \i C:/Users/Administrator/Desktop/sumbanganqueryrahmah/server/sql/import_aeon_branches_template.sql
--
-- Notes:
-- - Fill the CSV with real AEON Credit Service branch data first.
-- - branch_lat and branch_lng are required.
-- - postcode is optional but recommended for nearest-branch lookup.

BEGIN;

CREATE TEMP TABLE tmp_aeon_branches_import (
  name text,
  branch_address text,
  phone_number text,
  fax_number text,
  business_hour text,
  day_open text,
  cdm_available text,
  atm_cdm text,
  inquiry_availability text,
  application_availability text,
  aeon_lounge text,
  branch_lat text,
  branch_lng text,
  postcode text,
  state text
);

\copy tmp_aeon_branches_import (
  name,
  branch_address,
  phone_number,
  fax_number,
  business_hour,
  day_open,
  cdm_available,
  atm_cdm,
  inquiry_availability,
  application_availability,
  aeon_lounge,
  branch_lat,
  branch_lng,
  postcode,
  state
) FROM :'csv_path' WITH (FORMAT csv, HEADER true, ENCODING 'UTF8');

WITH cleaned AS (
  SELECT
    NULLIF(trim(name), '') AS name,
    NULLIF(trim(branch_address), '') AS branch_address,
    NULLIF(trim(phone_number), '') AS phone_number,
    NULLIF(trim(fax_number), '') AS fax_number,
    NULLIF(trim(business_hour), '') AS business_hour,
    NULLIF(trim(day_open), '') AS day_open,
    COALESCE(
      NULLIF(trim(atm_cdm), ''),
      CASE lower(trim(coalesce(cdm_available, '')))
        WHEN 'ya' THEN 'CDM tersedia'
        WHEN 'yes' THEN 'CDM available'
        WHEN 'y' THEN 'CDM tersedia'
        WHEN '1' THEN 'CDM tersedia'
        WHEN 'true' THEN 'CDM tersedia'
        WHEN 'tidak' THEN 'Tiada CDM'
        WHEN 'no' THEN 'Tiada CDM'
        WHEN 'n' THEN 'Tiada CDM'
        WHEN '0' THEN 'Tiada CDM'
        WHEN 'false' THEN 'Tiada CDM'
        ELSE NULL
      END
    ) AS atm_cdm,
    NULLIF(trim(inquiry_availability), '') AS inquiry_availability,
    NULLIF(trim(application_availability), '') AS application_availability,
    NULLIF(trim(aeon_lounge), '') AS aeon_lounge,
    NULLIF(trim(branch_lat), '')::double precision AS branch_lat,
    NULLIF(trim(branch_lng), '')::double precision AS branch_lng,
    CASE
      WHEN length(regexp_replace(coalesce(postcode, ''), '[^0-9]', '', 'g')) = 4
        THEN lpad(regexp_replace(coalesce(postcode, ''), '[^0-9]', '', 'g'), 5, '0')
      WHEN length(regexp_replace(coalesce(postcode, ''), '[^0-9]', '', 'g')) >= 5
        THEN left(regexp_replace(coalesce(postcode, ''), '[^0-9]', '', 'g'), 5)
      ELSE NULL
    END AS postcode,
    NULLIF(trim(state), '') AS state
  FROM tmp_aeon_branches_import
)
INSERT INTO public.aeon_branches (
  id,
  name,
  branch_address,
  phone_number,
  fax_number,
  business_hour,
  day_open,
  atm_cdm,
  inquiry_availability,
  application_availability,
  aeon_lounge,
  branch_lat,
  branch_lng
)
SELECT
  gen_random_uuid(),
  name,
  branch_address,
  phone_number,
  fax_number,
  business_hour,
  day_open,
  atm_cdm,
  inquiry_availability,
  application_availability,
  aeon_lounge,
  branch_lat,
  branch_lng
FROM cleaned
WHERE name IS NOT NULL
  AND branch_lat IS NOT NULL
  AND branch_lng IS NOT NULL
ON CONFLICT ((lower(name))) DO UPDATE SET
  branch_address = EXCLUDED.branch_address,
  phone_number = EXCLUDED.phone_number,
  fax_number = EXCLUDED.fax_number,
  business_hour = EXCLUDED.business_hour,
  day_open = EXCLUDED.day_open,
  atm_cdm = EXCLUDED.atm_cdm,
  inquiry_availability = EXCLUDED.inquiry_availability,
  application_availability = EXCLUDED.application_availability,
  aeon_lounge = EXCLUDED.aeon_lounge,
  branch_lat = EXCLUDED.branch_lat,
  branch_lng = EXCLUDED.branch_lng;

WITH cleaned AS (
  SELECT
    NULLIF(trim(name), '') AS name,
    CASE
      WHEN length(regexp_replace(coalesce(postcode, ''), '[^0-9]', '', 'g')) = 4
        THEN lpad(regexp_replace(coalesce(postcode, ''), '[^0-9]', '', 'g'), 5, '0')
      WHEN length(regexp_replace(coalesce(postcode, ''), '[^0-9]', '', 'g')) >= 5
        THEN left(regexp_replace(coalesce(postcode, ''), '[^0-9]', '', 'g'), 5)
      ELSE NULL
    END AS postcode,
    NULLIF(trim(branch_lat), '')::double precision AS branch_lat,
    NULLIF(trim(branch_lng), '')::double precision AS branch_lng,
    NULLIF(trim(state), '') AS state
  FROM tmp_aeon_branches_import
)
INSERT INTO public.aeon_branch_postcodes (
  postcode,
  lat,
  lng,
  source_branch,
  state
)
SELECT
  postcode,
  branch_lat,
  branch_lng,
  name,
  state
FROM cleaned
WHERE name IS NOT NULL
  AND postcode ~ '^[0-9]{5}$'
  AND branch_lat IS NOT NULL
  AND branch_lng IS NOT NULL
ON CONFLICT (postcode) DO UPDATE SET
  lat = EXCLUDED.lat,
  lng = EXCLUDED.lng,
  source_branch = EXCLUDED.source_branch,
  state = EXCLUDED.state;

COMMIT;

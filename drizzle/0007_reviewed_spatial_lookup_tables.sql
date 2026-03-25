CREATE TABLE IF NOT EXISTS public.aeon_branches (
  id text PRIMARY KEY,
  name text NOT NULL,
  branch_address text,
  phone_number text,
  fax_number text,
  business_hour text,
  day_open text,
  atm_cdm text,
  inquiry_availability text,
  application_availability text,
  aeon_lounge text,
  branch_lat double precision NOT NULL,
  branch_lng double precision NOT NULL
);

CREATE TABLE IF NOT EXISTS public.aeon_branch_postcodes (
  postcode text PRIMARY KEY,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  source_branch text,
  state text
);

ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS branch_address text;
ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS phone_number text;
ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS fax_number text;
ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS business_hour text;
ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS day_open text;
ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS atm_cdm text;
ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS inquiry_availability text;
ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS application_availability text;
ALTER TABLE public.aeon_branches ADD COLUMN IF NOT EXISTS aeon_lounge text;

UPDATE public.aeon_branches
SET
  name = trim(COALESCE(name, '')),
  branch_address = NULLIF(trim(COALESCE(branch_address, '')), ''),
  phone_number = NULLIF(trim(COALESCE(phone_number, '')), ''),
  fax_number = NULLIF(trim(COALESCE(fax_number, '')), ''),
  business_hour = NULLIF(trim(COALESCE(business_hour, '')), ''),
  day_open = NULLIF(trim(COALESCE(day_open, '')), ''),
  atm_cdm = NULLIF(trim(COALESCE(atm_cdm, '')), ''),
  inquiry_availability = NULLIF(trim(COALESCE(inquiry_availability, '')), ''),
  application_availability = NULLIF(trim(COALESCE(application_availability, '')), ''),
  aeon_lounge = NULLIF(trim(COALESCE(aeon_lounge, '')), '');

DELETE FROM public.aeon_branches
WHERE trim(COALESCE(name, '')) = '';

UPDATE public.aeon_branch_postcodes
SET
  source_branch = NULLIF(trim(COALESCE(source_branch, '')), ''),
  state = NULLIF(trim(COALESCE(state, '')), '');

CREATE INDEX IF NOT EXISTS idx_aeon_branches_lat_lng
ON public.aeon_branches(branch_lat, branch_lng);

CREATE UNIQUE INDEX IF NOT EXISTS idx_aeon_branches_name_unique
ON public.aeon_branches(lower(name));

CREATE INDEX IF NOT EXISTS idx_aeon_postcodes
ON public.aeon_branch_postcodes(postcode);

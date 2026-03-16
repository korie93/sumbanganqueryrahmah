export type AiRepositoryOptions = {
  ensureSpatialTables: () => Promise<void>;
};

export type BranchSearchResult = {
  name: string;
  address: string | null;
  phone: string | null;
  fax: string | null;
  businessHour: string | null;
  dayOpen: string | null;
  atmCdm: string | null;
  inquiryAvailability: string | null;
  applicationAvailability: string | null;
  aeonLounge: string | null;
};

export type AiSearchRecordRow = {
  rowId: string;
  importId: string;
  importName: string | null;
  importFilename: string | null;
  jsonDataJsonb: unknown;
};

export type AiSemanticSearchRow = AiSearchRecordRow & {
  content: string;
  score: number;
};

export type AiFuzzySearchRow = AiSearchRecordRow & {
  score: number;
};

export type BranchRowDb = {
  name: string;
  branch_address: string | null;
  phone_number: string | null;
  fax_number: string | null;
  business_hour: string | null;
  day_open: string | null;
  atm_cdm: string | null;
  inquiry_availability: string | null;
  application_availability: string | null;
  aeon_lounge: string | null;
  distance_km?: number | string | null;
};

export type PostcodeLatLngRow = {
  lat: number | string;
  lng: number | string;
};

export type CountRow = {
  count: number | string;
};

export type ImportBranchSourceRow = {
  id: string;
  jsonDataJsonb: unknown;
};

export type BranchSeedRow = {
  name: string;
  branch_address: string | null;
  branch_lat: number | string | null;
  branch_lng: number | string | null;
};

export type AiBranchImportDetectedKeys = {
  nameKey: string | null;
  latKey: string | null;
  lngKey: string | null;
  addressKey: string | null;
  postcodeKey: string | null;
  phoneKey: string | null;
  faxKey: string | null;
  businessHourKey: string | null;
  dayOpenKey: string | null;
  atmKey: string | null;
  inquiryKey: string | null;
  applicationKey: string | null;
  loungeKey: string | null;
  stateKey: string | null;
};

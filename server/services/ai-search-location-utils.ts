import type { AiSearchJsonRecord } from "./ai-search-query-shared";

const RELATION_WORDS = [
  "pasangan",
  "wakil",
  "hubungan",
  "spouse",
  "guardian",
  "emergency",
  "waris",
  "ibu",
  "bapa",
  "suami",
  "isteri",
];

const CUSTOMER_ADDRESS_CONTEXT_WORDS = [
  "home",
  "mail",
  "mailing",
  "correspondence",
  "residence",
  "residential",
  "current",
  "customer",
  "applicant",
  "pemohon",
];

const CUSTOMER_LOCALITY_KEYS = [
  "bandar",
  "city",
  "citytown",
  "town",
  "district",
  "daerah",
  "mukim",
  "negeri",
  "state",
];

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isRelationKey(normalizedKey: string): boolean {
  const relationWordsNorm = RELATION_WORDS.map(normalizeKey);
  return relationWordsNorm.some((word) => normalizedKey.includes(word));
}

function isOfficeKey(normalizedKey: string): boolean {
  return normalizedKey.includes("office") || normalizedKey.includes("pejabat");
}

function isPostcodeKey(normalizedKey: string): boolean {
  return (
    normalizedKey.includes("postcode") ||
    normalizedKey.includes("postalcode") ||
    normalizedKey.includes("poskod") ||
    normalizedKey.includes("zipcode") ||
    normalizedKey === "zip"
  );
}

function hasCustomerAddressContext(normalizedKey: string): boolean {
  return CUSTOMER_ADDRESS_CONTEXT_WORDS.some((word) => normalizedKey.includes(word));
}

function isAddressKey(normalizedKey: string): boolean {
  return (
    normalizedKey === "address" ||
    normalizedKey.includes("address") ||
    normalizedKey.includes("alamat")
  );
}

function isLocalityKey(normalizedKey: string): boolean {
  return CUSTOMER_LOCALITY_KEYS.some(
    (word) => normalizedKey === word || normalizedKey.includes(word),
  );
}

export function extractLatLng(data: AiSearchJsonRecord): { lat: number; lng: number } | null {
  const keys = Object.keys(data);
  const findValue = (names: string[]) => {
    const key = keys.find((candidate) => names.includes(candidate.toLowerCase()));
    if (!key) return null;
    const value = Number(String(data[key]).replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(value) ? value : null;
  };

  const lat = findValue(["lat", "latitude", "latitud"]);
  const lng = findValue(["lng", "long", "longitude", "longitud"]);
  if (lat === null || lng === null) {
    return null;
  }

  return { lat, lng };
}

export function isLatLng(value: unknown): value is { lat: number; lng: number } {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { lat?: unknown; lng?: unknown };
  return (
    typeof candidate.lat === "number" &&
    Number.isFinite(candidate.lat) &&
    typeof candidate.lng === "number" &&
    Number.isFinite(candidate.lng)
  );
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function hasPostcodeCoord(value: unknown): value is { lat: number; lng: number } {
  return isLatLng(value);
}

export function extractCustomerPostcode(data: AiSearchJsonRecord): string | null {
  if (!data || typeof data !== "object") return null;
  const entries = Object.entries(data);

  const extractDigits = (value: unknown): string | null => {
    if (value === undefined || value === null) return null;
    const raw = String(value);
    const five = raw.match(/\b\d{5}\b/);
    if (five) return five[0];
    const four = raw.match(/\b\d{4}\b/);
    if (four) return `0${four[0]}`;
    return null;
  };

  const pickByKey = (
    matcher: (normalizedKey: string, rawKey: string) => boolean,
    valueMatcher?: (normalizedKey: string, rawValue: unknown) => boolean,
  ): string | null => {
    for (const [rawKey, rawValue] of entries) {
      const keyNorm = normalizeKey(rawKey);
      if (!matcher(keyNorm, rawKey)) continue;
      if (valueMatcher && !valueMatcher(keyNorm, rawValue)) continue;
      const postcode = extractDigits(rawValue);
      if (postcode) return postcode;
    }
    return null;
  };

  const preferredCustomerPostcode = pickByKey(
    (key) =>
      !isRelationKey(key) &&
      !isOfficeKey(key) &&
      isPostcodeKey(key) &&
      hasCustomerAddressContext(key),
  );
  if (preferredCustomerPostcode) return preferredCustomerPostcode;

  const genericPostcode = pickByKey((key) => {
    if (!isPostcodeKey(key)) return false;
    if (/[23]$/.test(key)) return false;
    if (isOfficeKey(key)) return false;
    if (isRelationKey(key)) return false;
    return true;
  });
  if (genericPostcode) return genericPostcode;

  return pickByKey(
    (key) => {
      if (isRelationKey(key)) return false;
      if (isOfficeKey(key)) return false;
      return isAddressKey(key) || key.includes("alamatsuratmenyurat");
    },
    (_key, rawValue) => isNonEmptyString(rawValue),
  );
}

export function extractCustomerLocationHint(data: AiSearchJsonRecord): string {
  if (!data || typeof data !== "object") return "";

  const parts: string[] = [];
  for (const [rawKey, rawValue] of Object.entries(data)) {
    if (!isNonEmptyString(rawValue)) continue;
    const key = normalizeKey(rawKey);
    if (isRelationKey(key)) continue;
    if (isOfficeKey(key)) continue;

    const isLocationField =
      isAddressKey(key) ||
      key.includes("alamatsuratmenyurat") ||
      isLocalityKey(key) ||
      isPostcodeKey(key);

    if (!isLocationField) continue;
    const value = String(rawValue).trim();
    if (value) {
      parts.push(value);
    }
  }

  return Array.from(new Set(parts)).join(" ");
}

export function normalizeLocationHint(value: string): string {
  return value.replace(/[^a-z0-9\s]/gi, " ").replace(/\s+/g, " ").trim();
}

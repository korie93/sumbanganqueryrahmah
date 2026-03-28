import type { AiIntent } from "./ai-search-types";

export type AiSearchJsonRecord = Record<string, unknown>;

export type AiSearchRowLike = {
  rowId?: string;
  jsonDataJsonb?: unknown;
  [key: string]: unknown;
};

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
    normalizedKey.includes("postcode")
    || normalizedKey.includes("postalcode")
    || normalizedKey.includes("poskod")
    || normalizedKey.includes("zipcode")
    || normalizedKey === "zip"
  );
}

function hasCustomerAddressContext(normalizedKey: string): boolean {
  return CUSTOMER_ADDRESS_CONTEXT_WORDS.some((word) => normalizedKey.includes(word));
}

function isAddressKey(normalizedKey: string): boolean {
  return (
    normalizedKey === "address"
    || normalizedKey.includes("address")
    || normalizedKey.includes("alamat")
  );
}

function isLocalityKey(normalizedKey: string): boolean {
  return CUSTOMER_LOCALITY_KEYS.some((word) => normalizedKey === word || normalizedKey.includes(word));
}

function normalizeToObject(value: unknown): AiSearchJsonRecord {
  if (value && typeof value === "object") {
    return value as AiSearchJsonRecord;
  }
  return {};
}

export function parseIntentFallback(query: string): AiIntent {
  const digits = query.match(/\d{6,}/g) || [];
  const ic = digits.find((value) => value.length === 12) || null;
  const account = digits.find((value) => value.length >= 10 && value.length <= 16) || null;
  const phone = digits.find((value) => value.length >= 9 && value.length <= 11) || null;
  const needBranch = /cawangan|branch|terdekat|nearest|lokasi|alamat/i.test(query);
  const name = needBranch ? null : (ic ? null : query.trim());

  return {
    intent: "search_person",
    entities: {
      name,
      ic,
      account_no: account,
      phone,
      address: null,
      count_groups: null,
    },
    need_nearest_branch: needBranch,
  };
}

export function extractJsonObject(text: string): Record<string, unknown> | null {
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first === -1 || last === -1 || last <= first) {
    return null;
  }

  try {
    const parsed = JSON.parse(text.slice(first, last + 1));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function tokenizeQuery(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9]/gi, ""))
    .filter((token) => token.length >= 3);
}

export function buildFieldMatchSummary(data: AiSearchJsonRecord, query: string): string[] {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) {
    return [];
  }

  const matches: Array<{ key: string; value: string; score: number }> = [];
  for (const [key, value] of Object.entries(data).slice(0, 80)) {
    if (key === "id") continue;
    const valueStr = String(value ?? "");
    const valueLower = valueStr.toLowerCase();
    let score = 0;
    for (const token of tokens) {
      if (valueLower.includes(token)) score += 1;
    }
    if (score > 0) {
      matches.push({ key, value: valueStr, score });
    }
  }

  return matches
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((match) => `${match.key}: ${match.value}`);
}

export function rowScore(
  row: AiSearchRowLike,
  ic?: string | null,
  name?: string | null,
  account?: string | null,
  phone?: string | null,
): number {
  const data = normalizeToObject(row.jsonDataJsonb);
  let score = 0;
  const icDigits = ic ? ic.replace(/\D/g, "") : "";
  const accountDigits = account ? account.replace(/\D/g, "") : "";
  const phoneDigits = phone ? phone.replace(/\D/g, "") : "";

  for (const [key, value] of Object.entries(data).slice(0, 80)) {
    const keyLower = key.toLowerCase();
    const valueStr = String(value ?? "");
    const valueDigits = valueStr.replace(/\D/g, "");

    if (icDigits && valueDigits === icDigits) {
      score +=
        keyLower.includes("ic") ||
        keyLower.includes("mykad") ||
        keyLower.includes("nric") ||
        keyLower.includes("kp") ||
        keyLower.includes("id no") ||
        keyLower.includes("idno")
          ? 20
          : 10;
    }
    if (accountDigits && valueDigits === accountDigits) {
      score += keyLower.includes("akaun") || keyLower.includes("account") ? 12 : 6;
    }
    if (phoneDigits && valueDigits === phoneDigits) {
      score +=
        keyLower.includes("telefon") || keyLower.includes("phone") || keyLower.includes("hp")
          ? 8
          : 4;
    }
    if (name && valueStr.toLowerCase().includes(name.toLowerCase())) {
      score += keyLower.includes("nama") || keyLower.includes("name") ? 6 : 2;
    }
  }

  return score;
}

export function scoreRowDigits(
  row: AiSearchRowLike,
  digits: string,
): { score: number; parsed: AiSearchJsonRecord } {
  const data = toObjectJson(row.jsonDataJsonb) || {};

  const keyGroups: Array<{ keys: string[]; score: number }> = [
    { keys: ["No. MyKad", "ID No", "No Pengenalan", "IC", "NRIC", "MyKad"], score: 20 },
    {
      keys: [
        "Account No",
        "Account Number",
        "Card No",
        "No Akaun",
        "Nombor Akaun Bank Pemohon",
      ],
      score: 12,
    },
    {
      keys: ["No. Telefon Rumah", "No. Telefon Bimbit", "Phone", "Handphone", "OfficePhone"],
      score: 8,
    },
  ];

  let best = 0;
  for (const group of keyGroups) {
    for (const key of group.keys) {
      const value = data[key];
      if (!value) continue;
      if (String(value).replace(/\D/g, "") === digits) {
        best = Math.max(best, group.score);
      }
    }
  }

  return { score: best, parsed: data };
}

export function ensureJsonRow<T extends AiSearchRowLike>(row: T): T {
  if (typeof row?.jsonDataJsonb === "string") {
    try {
      row.jsonDataJsonb = JSON.parse(row.jsonDataJsonb);
    } catch {
      // Keep original string payload for compatibility.
    }
  }
  return row;
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
      !isRelationKey(key)
      && !isOfficeKey(key)
      && isPostcodeKey(key)
      && hasCustomerAddressContext(key),
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
      return (
        isAddressKey(key)
        || key.includes("alamatsuratmenyurat")
      );
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
      isAddressKey(key)
      || key.includes("alamatsuratmenyurat")
      || isLocalityKey(key)
      || isPostcodeKey(key);

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

export function toObjectJson(value: unknown): AiSearchJsonRecord | null {
  if (!value) return null;
  if (typeof value === "object") return value as AiSearchJsonRecord;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" ? (parsed as AiSearchJsonRecord) : null;
    } catch {
      return null;
    }
  }
  return null;
}

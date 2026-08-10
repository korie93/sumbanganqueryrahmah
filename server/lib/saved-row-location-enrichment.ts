import { allPostcodes } from "malaysia-postcodes";

type AddressContext = "generic" | "home" | "office";
type PostalLocation = {
  district: string;
  state: string;
};

const MAX_ROW_FIELDS = 300;
const MAX_LOCATION_VALUE_LENGTH = 160;
const FOREIGN_ADDRESS_MARKERS = new Set([
  "brunei",
  "china",
  "hongkong",
  "india",
  "indonesia",
  "philippines",
  "singapore",
  "thailand",
  "vietnam",
]);

const LOCATION_KEYS: Record<AddressContext, { district: string; state: string }> = {
  generic: { district: "Postal District", state: "State" },
  home: { district: "Home Postal District", state: "Home State" },
  office: { district: "Office Postal District", state: "Office State" },
};

function normalizeHeader(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeStateName(value: string): string {
  return value.replace(/^Wp\s+/i, "W.P. ").trim();
}

function buildPostcodeLocations(): Map<string, PostalLocation | null> {
  const locations = new Map<string, PostalLocation | null>();

  for (const state of allPostcodes) {
    for (const city of state.city) {
      for (const postcode of city.postcode) {
        const location = {
          district: String(city.name || "").trim(),
          state: normalizeStateName(String(state.name || "")),
        };
        if (!location.district || !location.state) continue;

        const existing = locations.get(postcode);
        if (existing === undefined) {
          locations.set(postcode, location);
        } else if (
          existing !== null
          && (existing.district !== location.district || existing.state !== location.state)
        ) {
          locations.set(postcode, null);
        }
      }
    }
  }

  return locations;
}

const POSTCODE_LOCATIONS = buildPostcodeLocations();

function readScalar(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") {
    return String(value).trim().slice(0, MAX_LOCATION_VALUE_LENGTH);
  }
  return "";
}

function hasMeaningfulValue(value: unknown): boolean {
  const normalized = readScalar(value);
  return normalized !== "" && normalized !== "-";
}

function normalizePostcode(value: unknown): string | null {
  const digits = readScalar(value).replace(/\D+/g, "");
  if (/^\d{4}$/.test(digits)) return digits.padStart(5, "0");
  return /^\d{5}$/.test(digits) ? digits : null;
}

function getAddressContext(normalizedHeader: string): AddressContext {
  if (/(?:office|business|company|employer|pejabat|work)/.test(normalizedHeader)) {
    return "office";
  }
  if (/(?:home|kediaman|mailing|permanent|residential|rumah)/.test(normalizedHeader)) {
    return "home";
  }
  return "generic";
}

function getPostcodeContext(header: string): AddressContext | null {
  const normalizedHeader = normalizeHeader(header);
  if (!/(?:postcode|postalcode|poskod|zipcode)/.test(normalizedHeader)) {
    return null;
  }
  return getAddressContext(normalizedHeader);
}

function isAddressContextField(header: string): boolean {
  const normalizedHeader = normalizeHeader(header);
  return /(?:address|alamat|country|negara)/.test(normalizedHeader);
}

function hasForeignAddressMarker(value: unknown): boolean {
  const tokens = readScalar(value)
    .normalize("NFKD")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
  return tokens.some((token) => FOREIGN_ADDRESS_MARKERS.has(token));
}

function getLocationField(
  header: string,
): { context: AddressContext; kind: "district" | "state" } | null {
  const normalizedHeader = normalizeHeader(header);
  const context = getAddressContext(normalizedHeader);
  if (/(?:postaldistrict|district|daerah|city|town|bandar|mukim)/.test(normalizedHeader)) {
    return { context, kind: "district" };
  }
  if (/^(?:(?:home|rumah|office|pejabat|business|employer|mailing|permanent|residential))?(?:state|negeri|province|region)(?:(?:home|rumah|office|pejabat))?$/.test(
    normalizedHeader,
  )) {
    return { context, kind: "state" };
  }
  return null;
}

export function enrichSavedRowLocation(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const source = value as Record<string, unknown>;
  const entries = Object.entries(source).slice(0, MAX_ROW_FIELDS);
  const postcodes = new Map<AddressContext, { header: string; value: string }>();
  const existing = new Set<string>();
  const foreignAddressContexts = new Set<AddressContext>();

  for (const [header, rawValue] of entries) {
    if (!hasMeaningfulValue(rawValue)) continue;

    if (isAddressContextField(header) && hasForeignAddressMarker(rawValue)) {
      foreignAddressContexts.add(getAddressContext(normalizeHeader(header)));
    }

    const postcodeContext = getPostcodeContext(header);
    const postcode = postcodeContext ? normalizePostcode(rawValue) : null;
    if (postcodeContext && postcode && !postcodes.has(postcodeContext)) {
      postcodes.set(postcodeContext, { header, value: postcode });
    }

    const locationField = getLocationField(header);
    if (locationField) {
      existing.add(`${locationField.context}:${locationField.kind}`);
    }
  }

  let enriched: Record<string, unknown> | null = null;
  const setValue = (key: string, nextValue: string) => {
    if (hasMeaningfulValue(source[key])) return;
    enriched ??= { ...source };
    enriched[key] = nextValue;
  };

  for (const [context, postcodeEntry] of postcodes) {
    if (foreignAddressContexts.has(context)) continue;

    if (readScalar(source[postcodeEntry.header]) !== postcodeEntry.value) {
      enriched ??= { ...source };
      enriched[postcodeEntry.header] = postcodeEntry.value;
    }

    const location = POSTCODE_LOCATIONS.get(postcodeEntry.value);
    if (!location) continue;

    const keys = LOCATION_KEYS[context];
    if (!existing.has(`${context}:district`)) {
      setValue(keys.district, location.district);
    }
    if (!existing.has(`${context}:state`)) {
      setValue(keys.state, location.state);
    }
  }

  return enriched ?? source;
}

export function enrichSavedDataRow<T extends { jsonDataJsonb?: unknown }>(row: T): T {
  const enriched = enrichSavedRowLocation(row.jsonDataJsonb);
  if (!enriched || enriched === row.jsonDataJsonb) {
    return row;
  }

  return { ...row, jsonDataJsonb: enriched };
}

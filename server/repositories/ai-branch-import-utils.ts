import type { AiBranchImportDetectedKeys } from "./ai-repository-types";

export function coerceImportBranchRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function detectAiBranchImportKeys(
  sample: Record<string, unknown>,
): AiBranchImportDetectedKeys {
  const normalizeKey = (key: string) => key.toLowerCase().replace(/[^a-z0-9]/g, "");
  const keys = Object.keys(sample);
  const normalized = keys.map((key) => ({ raw: key, norm: normalizeKey(key) }));
  const findBy = (candidates: string[]) => {
    const hit = normalized.find((key) =>
      candidates.some((candidate) => key.norm.includes(candidate)),
    );
    return hit?.raw || null;
  };

  return {
    nameKey: findBy(["branchnames", "branchname", "cawangan", "branch", "nama"]),
    latKey: findBy(["latitude", "lat"]),
    lngKey: findBy(["longitude", "lng", "long"]),
    addressKey: findBy(["branchaddress", "address", "alamat"]),
    postcodeKey: findBy(["postcode", "poskod", "postalcode", "zip"]),
    phoneKey: findBy(["phonenumber", "phone", "telefon", "tel"]),
    faxKey: findBy(["faxnumber", "fax"]),
    businessHourKey: findBy(["businesshour", "operatinghour", "waktu", "jam"]),
    dayOpenKey: findBy(["dayopen", "day", "hari"]),
    atmKey: findBy(["atmcdm", "atm", "cdm"]),
    inquiryKey: findBy(["inquiryavailability", "inquiry"]),
    applicationKey: findBy(["applicationavailability", "application"]),
    loungeKey: findBy(["aeonlounge", "lounge"]),
    stateKey: findBy(["state", "negeri"]),
  };
}

export function normalizeImportedBranchPostcode(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const raw = String(value);
  const fiveDigits = raw.match(/\b\d{5}\b/);
  if (fiveDigits) return fiveDigits[0];
  const fourDigits = raw.match(/\b\d{4}\b/);
  if (fourDigits) return `0${fourDigits[0]}`;
  return null;
}

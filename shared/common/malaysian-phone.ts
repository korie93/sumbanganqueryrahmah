const MAX_PHONE_INPUT_LENGTH = 64;

function readPhoneDigits(value: unknown): string {
  const normalized = String(value ?? "").trim();
  if (!normalized || normalized.length > MAX_PHONE_INPUT_LENGTH) {
    return "";
  }

  return normalized.replace(/\D+/g, "");
}

function isPlausibleMalaysianNationalNumber(value: string): boolean {
  return /^0(?:1\d{8,9}|[3-9]\d{7,8})$/.test(value);
}

export function restoreMissingMalaysianMobilePrefix(value: string): string {
  return /^1\d{8,9}$/.test(value) ? `0${value}` : value;
}

export function normalizeMalaysianPhoneSearchValue(value: unknown): string {
  const digits = readPhoneDigits(value);
  if (!digits) {
    return "";
  }

  if (digits.startsWith("0060") && digits.length > 4) {
    return restoreMissingMalaysianMobilePrefix(`0${digits.slice(4)}`);
  }
  if (digits.startsWith("60") && digits.length > 2) {
    return restoreMissingMalaysianMobilePrefix(`0${digits.slice(2)}`);
  }

  return restoreMissingMalaysianMobilePrefix(digits);
}

export function buildMalaysianPhoneSearchVariants(value: unknown): string[] {
  const digits = readPhoneDigits(value);
  const normalized = normalizeMalaysianPhoneSearchValue(value);
  if (!digits || !isPlausibleMalaysianNationalNumber(normalized)) {
    return [];
  }

  return Array.from(new Set([
    digits,
    normalized,
    normalized.slice(1),
    `60${normalized.slice(1)}`,
    `0060${normalized.slice(1)}`,
  ]));
}

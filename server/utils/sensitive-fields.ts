// AUDIT2-FIX [M7]: Canonical list of fields that must not leak through generic API serializers.
export const SENSITIVE_FIELDS = [
  "password",
  "passwordHash",
  "password_hash",
  "hashedPassword",
  "salt",
  "secret",
  "privateKey",
  "private_key",
  "totpSecret",
  "totp_secret",
  "twoFactorSecret",
  "two_factor_secret",
  "twoFactorSecretEncrypted",
  "two_factor_secret_encrypted",
  "encryptionKey",
  "encryption_key",
  "refreshToken",
  "refresh_token",
  "sessionToken",
  "session_token",
  "tokenHash",
  "token_hash",
  "apiKey",
  "api_key",
  "internalId",
] as const;

export type SensitiveField = (typeof SENSITIVE_FIELDS)[number];

export type SensitiveFieldFinding = {
  field: SensitiveField;
  path: string;
};

const SENSITIVE_FIELD_SET = new Set<string>(SENSITIVE_FIELDS);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSensitiveField(key: string): key is SensitiveField {
  return SENSITIVE_FIELD_SET.has(key);
}

export function findSensitiveFields(
  value: unknown,
  path = "response",
  seen = new WeakSet<object>(),
): SensitiveFieldFinding[] {
  if (typeof value !== "object" || value === null) {
    return [];
  }

  if (seen.has(value)) {
    return [];
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      findSensitiveFields(item, `${path}[${index}]`, seen),
    );
  }

  return Object.entries(value).flatMap(([key, child]) => {
    const childPath = `${path}.${key}`;
    const ownFinding = isSensitiveField(key)
      ? [{ field: key, path: childPath }]
      : [];
    return [
      ...ownFinding,
      ...findSensitiveFields(child, childPath, seen),
    ];
  });
}

export function assertNoSensitiveFields(value: unknown, path = "response"): void {
  const [firstFinding] = findSensitiveFields(value, path);
  if (!firstFinding) {
    return;
  }

  throw new Error(
    `[SECURITY] AUDIT2-FIX [M7]: Sensitive field "${firstFinding.field}" found in API response at path: ${firstFinding.path}. `
      + "This field must be removed from the serializer/DTO before sending to client.",
  );
}

export function deepOmitSensitiveFields<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  if (typeof value !== "object" || value === null) {
    return value;
  }

  const existing = seen.get(value);
  if (existing !== undefined) {
    return existing as T;
  }

  if (Array.isArray(value)) {
    const nextArray: unknown[] = [];
    seen.set(value, nextArray);
    for (const item of value) {
      nextArray.push(deepOmitSensitiveFields(item, seen));
    }
    return nextArray as T;
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const nextObject: Record<string, unknown> = {};
  seen.set(value, nextObject);
  for (const [key, child] of Object.entries(value)) {
    if (isSensitiveField(key)) {
      continue;
    }
    nextObject[key] = deepOmitSensitiveFields(child, seen);
  }
  return nextObject as T;
}

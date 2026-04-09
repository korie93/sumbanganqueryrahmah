import { runtimeConfig } from "./runtime";

const COLLECTION_PII_FIELD_NAMES = new Set([
  "customerName",
  "icNumber",
  "customerPhone",
  "accountNumber",
]);

let cachedCollectionPiiRetiredFieldsRaw: string | null = null;
let cachedCollectionPiiRetiredFields = new Set<string>();

export function getSessionSecret(): string {
  return runtimeConfig.auth.sessionSecret;
}

export function getCollectionNicknameTempPassword(): string {
  return runtimeConfig.auth.collectionNicknameTempPassword;
}

export function getTwoFactorEncryptionSecret(): string | null {
  const configured = String(process.env.TWO_FACTOR_ENCRYPTION_KEY || "").trim();
  return configured || null;
}

export function getCollectionPiiEncryptionSecret(): string | null {
  const configured = String(process.env.COLLECTION_PII_ENCRYPTION_KEY || "").trim();
  return configured || null;
}

function getCollectionPiiPreviousSecrets(): string[] {
  return String(process.env.COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function getTwoFactorDecryptionSecrets(): string[] {
  const secrets = new Set<string>();
  const configured = getTwoFactorEncryptionSecret();
  if (configured) {
    secrets.add(configured);
  }
  return Array.from(secrets);
}

export function getCollectionPiiDecryptionSecrets(): string[] {
  const secrets = new Set<string>();
  const configured = getCollectionPiiEncryptionSecret();
  if (configured) {
    secrets.add(configured);
  }
  for (const previousSecret of getCollectionPiiPreviousSecrets()) {
    secrets.add(previousSecret);
  }
  return Array.from(secrets);
}

export function getCollectionPiiRetiredFields(): Set<string> {
  const raw = String(process.env.COLLECTION_PII_RETIRED_FIELDS || "").trim();
  if (raw === cachedCollectionPiiRetiredFieldsRaw) {
    return cachedCollectionPiiRetiredFields;
  }

  cachedCollectionPiiRetiredFieldsRaw = raw;
  cachedCollectionPiiRetiredFields = new Set(
    raw
      .split(",")
      .map((value) => value.trim())
      .filter((value) => COLLECTION_PII_FIELD_NAMES.has(value)),
  );
  return cachedCollectionPiiRetiredFields;
}

export function isCollectionPiiPlaintextRetiredField(field: string): boolean {
  return getCollectionPiiRetiredFields().has(field);
}

export function shouldSeedDefaultUsers(): boolean {
  return runtimeConfig.auth.seedDefaultUsers;
}

export function readDatabasePassword(): string | undefined {
  return runtimeConfig.database.password || undefined;
}

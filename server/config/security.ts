import { readCommaSeparatedList, readOptionalString } from "./runtime-config-read-utils";
import { isProductionLikeEnvironment } from "./runtime-environment";
import { runtimeConfig } from "./runtime";

const ALLOWED_COLLECTION_PII_RETIRED_FIELDS = new Set([
  "customerName",
  "icNumber",
  "customerPhone",
  "accountNumber",
]);

export function getSessionSecret(): string {
  return runtimeConfig.auth.sessionSecret;
}

export function getCollectionNicknameTempPassword(): string {
  return runtimeConfig.auth.collectionNicknameTempPassword;
}

export function getTwoFactorEncryptionSecret(): string | null {
  return readOptionalString("TWO_FACTOR_ENCRYPTION_KEY");
}

function getTwoFactorPreviousSecrets(): string[] {
  return readCommaSeparatedList("TWO_FACTOR_ENCRYPTION_KEY_PREVIOUS");
}

export function getCollectionPiiEncryptionSecret(): string | null {
  return readOptionalString("COLLECTION_PII_ENCRYPTION_KEY");
}

function getCollectionPiiPreviousSecrets(): string[] {
  return readCommaSeparatedList("COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS");
}

export function getTwoFactorDecryptionSecrets(): string[] {
  const secrets = new Set<string>();
  const configured = getTwoFactorEncryptionSecret();
  if (configured) {
    secrets.add(configured);
  }
  for (const previousSecret of getTwoFactorPreviousSecrets()) {
    secrets.add(previousSecret);
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
  return new Set(
    readCommaSeparatedList("COLLECTION_PII_RETIRED_FIELDS").filter((field) =>
      ALLOWED_COLLECTION_PII_RETIRED_FIELDS.has(field),
    ),
  );
}

export function isCollectionPiiPlaintextRetiredField(field: string): boolean {
  return getCollectionPiiRetiredFields().has(field);
}

export function getBackupEncryptionRuntimeConfig(): {
  encryptionKey: string | null;
  encryptionKeys: string | null;
  encryptionKeyId: string | null;
  requireEncryption: boolean;
} {
  return {
    encryptionKey: readOptionalString("BACKUP_ENCRYPTION_KEY"),
    encryptionKeys: readOptionalString("BACKUP_ENCRYPTION_KEYS"),
    encryptionKeyId: readOptionalString("BACKUP_ENCRYPTION_KEY_ID"),
    requireEncryption: isProductionLikeEnvironment(),
  };
}

export function shouldSeedDefaultUsers(): boolean {
  return runtimeConfig.auth.seedDefaultUsers;
}

export function readDatabasePassword(): string | undefined {
  return runtimeConfig.database.password || undefined;
}

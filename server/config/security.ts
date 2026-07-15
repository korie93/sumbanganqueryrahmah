import {
  readBoolean,
  readCommaSeparatedList,
  readOptionalString,
} from "./runtime-config-read-utils";
import { isProductionLikeEnvironment } from "./runtime-environment";
import { runtimeConfig } from "./runtime";
import { isAllowedCollectionPiiRetiredField } from "./collection-pii-field-config";

export function getSessionSecret(): string {
  return runtimeConfig.auth.sessionSecret;
}

export function getAuditHmacKey(): string {
  return runtimeConfig.auth.auditHmacKey;
}

export function getCollectionNicknameTempPassword(): string {
  return runtimeConfig.auth.collectionNicknameTempPassword;
}

export function getTwoFactorEncryptionSecret(): string | null {
  return readOptionalString("TWO_FACTOR_ENCRYPTION_KEY");
}

export function getTwoFactorTotpAlgorithm(): "sha1" | "sha256" {
  return runtimeConfig.auth.twoFactorAlgorithm;
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

let cachedCollectionPiiRetiredFieldsRaw: string | null = null;
let cachedCollectionPiiRetiredFields: ReadonlySet<string> = new Set(
  runtimeConfig.collection.piiRetiredFields.filter((field) =>
    isAllowedCollectionPiiRetiredField(field),
  ),
);

export function getCollectionPiiRetiredFields(): ReadonlySet<string> {
  const rawValue = readOptionalString("COLLECTION_PII_RETIRED_FIELDS") ?? "";
  if (rawValue !== cachedCollectionPiiRetiredFieldsRaw) {
    cachedCollectionPiiRetiredFieldsRaw = rawValue;
    cachedCollectionPiiRetiredFields = new Set(
      readCommaSeparatedList("COLLECTION_PII_RETIRED_FIELDS").filter(
        isAllowedCollectionPiiRetiredField,
      ),
    );
  }
  return cachedCollectionPiiRetiredFields;
}

export function isCollectionPiiPlaintextRetiredField(field: string): boolean {
  return getCollectionPiiRetiredFields().has(field);
}

export function getBackupEncryptionRuntimeConfig(): {
  encryptionKey: string | null;
  encryptionKeys: string | null;
  encryptionKeyId: string | null;
  requireEncryption: boolean;
  allowLegacyUnencryptedRead: boolean;
} {
  return {
    encryptionKey: readOptionalString("BACKUP_ENCRYPTION_KEY"),
    encryptionKeys: readOptionalString("BACKUP_ENCRYPTION_KEYS"),
    encryptionKeyId: readOptionalString("BACKUP_ENCRYPTION_KEY_ID"),
    requireEncryption: isProductionLikeEnvironment(),
    allowLegacyUnencryptedRead: readBoolean(
      "BACKUP_ALLOW_LEGACY_UNENCRYPTED_READ",
      false,
    ),
  };
}

export function shouldSeedDefaultUsers(): boolean {
  return runtimeConfig.auth.seedDefaultUsers;
}

export function readDatabasePassword(): string | undefined {
  return runtimeConfig.database.password || undefined;
}

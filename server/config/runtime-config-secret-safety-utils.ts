const PLACEHOLDER_DATABASE_PASSWORDS = new Set([
  "change-this-db-password",
  "GENERATE_ME_DB_PASSWORD_DO_NOT_USE_IN_PRODUCTION",
]);
const PLACEHOLDER_BACKUP_ENCRYPTION_KEYS = new Set([
  "GENERATE_ME_BACKUP_KEY_AND_STORE_OFFLINE",
]);
const RUNTIME_SECRET_MIN_LENGTH = 32;
const SESSION_SECRET_MIN_BYTES = 32;
const TEMPLATE_SECRET_PATTERNS = [
  /^ganti-dengan-/i,
  /^change-this-/i,
  /^replace-me/i,
  /^changeme$/i,
  /^generate_me/i,
  /do_not_use/i,
  /placeholder/i,
  /example/i,
];

export function assertStrongRuntimeSecret(name: string, value: string): void {
  const normalized = String(value || "").trim();

  if (!normalized) {
    throw new Error(`${name} must be configured with a unique random secret.`);
  }

  if (normalized.length < RUNTIME_SECRET_MIN_LENGTH) {
    throw new Error(
      `${name} must be a unique random secret of at least ${RUNTIME_SECRET_MIN_LENGTH} characters.`,
    );
  }

  if (TEMPLATE_SECRET_PATTERNS.some((pattern) => pattern.test(normalized))) {
    throw new Error(`${name} must not use an example, placeholder, or template value.`);
  }
}

export function assertRuntimeSessionSecretMinBytes(
  value: string,
  options: { nodeEnv: string },
): void {
  if (options.nodeEnv === "test") {
    return;
  }

  const normalized = String(value || "").trim();
  if (Buffer.byteLength(normalized, "utf8") < SESSION_SECRET_MIN_BYTES) {
    throw new Error(
      `SESSION_SECRET must be at least ${SESSION_SECRET_MIN_BYTES} bytes in non-test runtime environments.`,
    );
  }
}

function assertOptionalStrongRuntimeSecret(name: string, value: string | null | undefined): void {
  if (!value) {
    return;
  }

  assertStrongRuntimeSecret(name, value);
}

export function assertNoPlaceholderSecrets(params: {
  isProductionLike: boolean;
  configuredSessionSecret: string | null;
  configuredPreviousSessionSecrets: readonly string[];
  configuredPgPassword: string | null;
  configuredTwoFactorEncryptionKey: string | null;
  configuredPreviousTwoFactorEncryptionKeys: readonly string[];
  configuredCollectionPiiEncryptionKey: string | null;
  configuredPreviousCollectionPiiEncryptionKeys: readonly string[];
  configuredBackupEncryptionKey: string | null;
  configuredBackupEncryptionKeys: string | null;
}) {
  if (!params.isProductionLike) {
    return;
  }

  assertOptionalStrongRuntimeSecret("SESSION_SECRET", params.configuredSessionSecret);

  for (const previousSecret of params.configuredPreviousSessionSecrets) {
    assertStrongRuntimeSecret("SESSION_SECRET_PREVIOUS", previousSecret);
  }

  if (params.configuredPgPassword && PLACEHOLDER_DATABASE_PASSWORDS.has(params.configuredPgPassword)) {
    throw new Error("PG_PASSWORD is using the default placeholder value and must be replaced before non-local startup.");
  }

  assertOptionalStrongRuntimeSecret(
    "TWO_FACTOR_ENCRYPTION_KEY",
    params.configuredTwoFactorEncryptionKey,
  );

  for (const previousTwoFactorKey of params.configuredPreviousTwoFactorEncryptionKeys) {
    assertStrongRuntimeSecret("TWO_FACTOR_ENCRYPTION_KEY_PREVIOUS", previousTwoFactorKey);
  }

  assertOptionalStrongRuntimeSecret(
    "COLLECTION_PII_ENCRYPTION_KEY",
    params.configuredCollectionPiiEncryptionKey,
  );

  for (const previousCollectionPiiKey of params.configuredPreviousCollectionPiiEncryptionKeys) {
    assertStrongRuntimeSecret("COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS", previousCollectionPiiKey);
  }

  const configuredBackupKeys = [
    params.configuredBackupEncryptionKey,
    ...String(params.configuredBackupEncryptionKeys || "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  ].filter((entry): entry is string => Boolean(entry));

  for (const backupKey of configuredBackupKeys) {
    if (PLACEHOLDER_BACKUP_ENCRYPTION_KEYS.has(backupKey)) {
      throw new Error(
        "BACKUP_ENCRYPTION_KEY or BACKUP_ENCRYPTION_KEYS contains a placeholder value and must be replaced before non-local startup.",
      );
    }
  }
}

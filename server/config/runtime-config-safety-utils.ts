import type { MailConfigurationAssessment, RuntimeConfigDiagnostic } from "./runtime-config-types";
import { normalizeCorsOrigin } from "./runtime-config-read-utils";

const AUTO_COOKIE_SECURE_VALUES = new Set(["", "auto", "1", "true", "0", "false"]);
const PLACEHOLDER_DATABASE_PASSWORDS = new Set([
  "change-this-db-password",
  "GENERATE_ME_DB_PASSWORD_DO_NOT_USE_IN_PRODUCTION",
]);
const PLACEHOLDER_BACKUP_ENCRYPTION_KEYS = new Set([
  "GENERATE_ME_BACKUP_KEY_AND_STORE_OFFLINE",
]);
const RUNTIME_SECRET_MIN_LENGTH = 32;
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
const UNSAFE_TRUST_PROXY_VALUES = new Set(["*", "all", "true", "1"]);

export const HSTS_PRELOAD_MIN_MAX_AGE_SECONDS = 31_536_000;
export const HSTS_PRODUCTION_MIN_MAX_AGE_SECONDS = 15_552_000;

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

function assertOptionalStrongRuntimeSecret(name: string, value: string | null | undefined): void {
  if (!value) {
    return;
  }

  assertStrongRuntimeSecret(name, value);
}

export function resolveTrustedProxies(rawValues: string[]): string[] {
  if (rawValues.length === 0) {
    return [];
  }

  if (rawValues.length > 32) {
    throw new Error("TRUSTED_PROXIES may contain at most 32 entries.");
  }

  for (const value of rawValues) {
    if (UNSAFE_TRUST_PROXY_VALUES.has(value.toLowerCase())) {
      throw new Error(
        "TRUSTED_PROXIES must list explicit proxy ranges or names such as loopback, and cannot use '*', 'all', 'true', or '1'.",
      );
    }
  }

  return rawValues;
}

export function resolvePreviousSessionSecrets(
  rawValues: string[],
  currentSessionSecret: string | null,
): string[] {
  if (rawValues.length === 0) {
    return [];
  }

  const normalizedCurrent = String(currentSessionSecret || "").trim();
  for (const value of rawValues) {
    if (normalizedCurrent && value === normalizedCurrent) {
      throw new Error("SESSION_SECRET_PREVIOUS must not include the active SESSION_SECRET value.");
    }
  }

  return rawValues;
}

export function resolvePreviousCollectionPiiSecrets(
  rawValues: string[],
  currentCollectionPiiSecret: string | null,
): string[] {
  if (rawValues.length === 0) {
    return [];
  }

  const normalizedCurrent = String(currentCollectionPiiSecret || "").trim();
  for (const value of rawValues) {
    if (normalizedCurrent && value === normalizedCurrent) {
      throw new Error(
        "COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS must not include the active COLLECTION_PII_ENCRYPTION_KEY value.",
      );
    }
  }

  return rawValues;
}

export function resolveCookieSecure(
  rawValue: string | null,
  params: { isProductionLike: boolean; publicAppUrl: string | null },
) {
  const explicit = String(rawValue || "").toLowerCase();
  if (!AUTO_COOKIE_SECURE_VALUES.has(explicit)) {
    throw new Error("AUTH_COOKIE_SECURE must be one of: auto, true, false, 1, or 0.");
  }
  if (params.isProductionLike && (explicit === "0" || explicit === "false")) {
    return true;
  }
  if (explicit === "1" || explicit === "true") {
    return true;
  }
  if (explicit === "0" || explicit === "false") {
    return false;
  }
  return params.isProductionLike || String(params.publicAppUrl || "").toLowerCase().startsWith("https://");
}

export function resolveHstsHeaderConfig(params: {
  isProductionLike: boolean;
  maxAgeSeconds: number;
  preloadEnabled: boolean;
}) {
  if (params.isProductionLike && params.maxAgeSeconds < HSTS_PRODUCTION_MIN_MAX_AGE_SECONDS) {
    throw new Error(
      `Production HSTS_MAX_AGE_SECONDS must be at least ${HSTS_PRODUCTION_MIN_MAX_AGE_SECONDS}. Use a non-production environment for shorter HSTS experiments.`,
    );
  }

  if (params.preloadEnabled && params.maxAgeSeconds < HSTS_PRELOAD_MIN_MAX_AGE_SECONDS) {
    throw new Error(
      `HSTS_PRELOAD_ENABLED requires HSTS_MAX_AGE_SECONDS to be at least ${HSTS_PRELOAD_MIN_MAX_AGE_SECONDS}. Verify every production subdomain is HTTPS-only before enabling preload.`,
    );
  }

  return {
    maxAge: params.maxAgeSeconds,
    includeSubDomains: true,
    preload: params.preloadEnabled,
  };
}

export function resolveCorsAllowedOrigins(params: {
  rawValue: string | null;
  publicAppUrl: string | null;
}): string[] {
  const configured = String(params.rawValue || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => normalizeCorsOrigin("CORS_ALLOWED_ORIGINS", entry));

  const publicOrigin = params.publicAppUrl ? new URL(params.publicAppUrl).origin : null;
  if (publicOrigin && !configured.includes(publicOrigin)) {
    configured.push(publicOrigin);
  }

  return Array.from(new Set(configured));
}

export function hasBackupEncryptionKeyConfigured(params: {
  configuredBackupEncryptionKey: string | null;
  configuredBackupEncryptionKeys: string | null;
}): boolean {
  return Boolean(
    params.configuredBackupEncryptionKey
    || params.configuredBackupEncryptionKeys,
  );
}

export function hasCollectionPiiEncryptionKeyConfigured(params: {
  configuredCollectionPiiEncryptionKey: string | null;
}): boolean {
  return Boolean(params.configuredCollectionPiiEncryptionKey);
}

export function hasTwoFactorEncryptionKeyConfigured(params: {
  configuredTwoFactorEncryptionKey: string | null;
}): boolean {
  return Boolean(params.configuredTwoFactorEncryptionKey);
}

export function assessMailConfiguration(params: {
  smtpService: string | null;
  smtpHost: string | null;
  smtpUser: string | null;
  smtpPassword: string | null;
  mailFrom: string | null;
}): MailConfigurationAssessment {
  const {
    smtpService,
    smtpHost,
    smtpUser,
    smtpPassword,
    mailFrom,
  } = params;
  const effectiveFrom = mailFrom || smtpUser || null;
  const hasAnyInput = Boolean(
    smtpService
    || smtpHost
    || smtpUser
    || smtpPassword
    || mailFrom,
  );

  let isConfigured = false;
  if (smtpService) {
    isConfigured = Boolean(smtpUser && smtpPassword && effectiveFrom);
  } else if (smtpHost) {
    isConfigured = Boolean(effectiveFrom && (!smtpUser || smtpPassword));
  }

  return {
    effectiveFrom,
    hasAnyInput,
    isConfigured,
    isIncomplete: hasAnyInput && !isConfigured,
  };
}

export function assertRuntimeSafetyGuards(params: {
  isProductionLike: boolean;
  isStrictLocalDevelopment: boolean;
  mailConfiguration: MailConfigurationAssessment;
  backupFeatureEnabled: boolean;
  hasBackupEncryptionKeyConfigured: boolean;
  hasCollectionPiiEncryptionKeyConfigured: boolean;
  hasTwoFactorEncryptionKeyConfigured: boolean;
  seedDefaultUsers: boolean;
  localSuperuserCredentialsFileEnabled: boolean;
  mailDevOutboxEnabled: boolean;
}) {
  const { isProductionLike, isStrictLocalDevelopment, mailConfiguration } = params;

  if (isProductionLike && params.backupFeatureEnabled && !params.hasBackupEncryptionKeyConfigured) {
    throw new Error(
      "BACKUP_ENCRYPTION_KEY or BACKUP_ENCRYPTION_KEYS is required when backups are enabled outside strict local development.",
    );
  }

  if (isProductionLike && !params.hasCollectionPiiEncryptionKeyConfigured) {
    throw new Error(
      "COLLECTION_PII_ENCRYPTION_KEY is required outside strict local development to protect collection PII shadow columns at rest.",
    );
  }

  if (isProductionLike && !params.hasTwoFactorEncryptionKeyConfigured) {
    throw new Error(
      "TWO_FACTOR_ENCRYPTION_KEY is required outside strict local development to protect stored two-factor secrets at rest.",
    );
  }

  if (!isStrictLocalDevelopment && params.seedDefaultUsers) {
    throw new Error(
      "SEED_DEFAULT_USERS is only allowed in strict local development mode.",
    );
  }

  if (!isStrictLocalDevelopment && params.localSuperuserCredentialsFileEnabled) {
    throw new Error(
      "LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED is only allowed in strict local development mode.",
    );
  }

  if (!isStrictLocalDevelopment && params.mailDevOutboxEnabled) {
    throw new Error(
      "MAIL_DEV_OUTBOX_ENABLED is only allowed in strict local development mode.",
    );
  }

  if (!isStrictLocalDevelopment && mailConfiguration.isIncomplete) {
    throw new Error(
      "SMTP mail configuration is incomplete. Configure MAIL_FROM/SMTP_* fully or clear the SMTP env vars entirely before startup.",
    );
  }
}

export function buildRuntimeConfigWarnings(params: {
  isStrictLocalDevelopment: boolean;
  isProductionLike: boolean;
  publicAppUrl: string | null;
  configuredSessionSecret: string | null;
  configuredCollectionNicknameTempPassword: string | null;
  configuredCollectionPiiEncryptionKey: string | null;
  configuredPgPassword: string | null;
  configuredAuthCookieSecure: string | null;
  configuredClusterMaxWorkers: number;
  mailConfiguration: MailConfigurationAssessment;
}): RuntimeConfigDiagnostic[] {
  const warnings: RuntimeConfigDiagnostic[] = [];
  const {
    isStrictLocalDevelopment,
    isProductionLike,
    publicAppUrl,
    configuredSessionSecret,
    configuredCollectionNicknameTempPassword,
    configuredCollectionPiiEncryptionKey,
    configuredPgPassword,
    configuredAuthCookieSecure,
    configuredClusterMaxWorkers,
    mailConfiguration,
  } = params;

  if (!publicAppUrl) {
    warnings.push({
      code: "PUBLIC_APP_URL_MISSING",
      envNames: ["PUBLIC_APP_URL"],
      message: "PUBLIC_APP_URL is not set; generated links and deployment health checks may be less reliable.",
      severity: "warning",
    });
  }

  if (isStrictLocalDevelopment && !configuredPgPassword) {
    warnings.push({
      code: "PG_PASSWORD_EMPTY_LOCAL",
      envNames: ["PG_PASSWORD"],
      message: "PG_PASSWORD is empty in strict local development. This is allowed locally but will fail against password-protected PostgreSQL servers.",
      severity: "warning",
    });
  }

  if (isStrictLocalDevelopment && !configuredSessionSecret) {
    warnings.push({
      code: "SESSION_SECRET_EPHEMERAL_LOCAL",
      envNames: ["SESSION_SECRET"],
      message: "SESSION_SECRET is not set, so a temporary in-memory secret will be generated on each boot.",
      severity: "warning",
    });
  }

  if (isStrictLocalDevelopment && !configuredCollectionNicknameTempPassword) {
    warnings.push({
      code: "COLLECTION_TEMP_PASSWORD_EPHEMERAL_LOCAL",
      envNames: ["COLLECTION_NICKNAME_TEMP_PASSWORD"],
      message: "COLLECTION_NICKNAME_TEMP_PASSWORD is not set, so a temporary value will be generated on each boot.",
      severity: "warning",
    });
  }

  if (isStrictLocalDevelopment && !configuredCollectionPiiEncryptionKey) {
    warnings.push({
      code: "COLLECTION_PII_ENCRYPTION_KEY_EMPTY_LOCAL",
      envNames: ["COLLECTION_PII_ENCRYPTION_KEY"],
      message: "COLLECTION_PII_ENCRYPTION_KEY is not set, so collection PII shadow columns stay plaintext-only in strict local development.",
      severity: "warning",
    });
  }

  if (mailConfiguration.isIncomplete) {
    warnings.push({
      code: "MAIL_CONFIGURATION_INCOMPLETE",
      envNames: ["MAIL_FROM", "SMTP_SERVICE", "SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"],
      message: isStrictLocalDevelopment
        ? "Mail delivery env vars are partially configured. Email delivery will stay disabled until the SMTP env vars are completed."
        : "Mail delivery env vars are partially configured.",
      severity: "warning",
    });
  }

  if (!isStrictLocalDevelopment && !mailConfiguration.hasAnyInput) {
    warnings.push({
      code: "MAIL_CONFIGURATION_MISSING",
      envNames: ["MAIL_FROM", "SMTP_SERVICE", "SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"],
      message:
        "SMTP mail configuration is not set. Activation and password-reset emails will not be delivered until MAIL_FROM/SMTP_* are configured.",
      severity: "warning",
    });
  }

  if (isProductionLike && /^(?:0|false)$/i.test(String(configuredAuthCookieSecure || "").trim())) {
    warnings.push({
      code: "AUTH_COOKIE_SECURE_FORCED_ON_PRODUCTION",
      envNames: ["AUTH_COOKIE_SECURE"],
      message: "AUTH_COOKIE_SECURE=false was ignored because secure auth cookies are mandatory on production-like hosts.",
      severity: "warning",
    });
  }

  if (configuredClusterMaxWorkers > 1) {
    warnings.push({
      code: "TWO_FACTOR_REPLAY_CACHE_PROCESS_LOCAL",
      envNames: ["SQR_MAX_WORKERS"],
      message:
        "2FA TOTP replay protection is process-local. Multi-worker deployments should use one worker, sticky routing, or a shared replay store before enabling more than one worker.",
      severity: "warning",
    });
  }

  return warnings;
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

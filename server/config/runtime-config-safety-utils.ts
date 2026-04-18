import { isIP } from "node:net";
import type { MailConfigurationAssessment, RuntimeConfigDiagnostic } from "./runtime-config-types";
import { normalizeCorsOrigin } from "./runtime-config-read-utils";

const AUTO_COOKIE_SECURE_VALUES = new Set(["", "auto", "1", "true", "0", "false"]);
const PLACEHOLDER_SESSION_SECRETS = new Set([
  "change-this-session-secret",
  "GENERATE_ME_AT_LEAST_32_CHARS_DO_NOT_USE_IN_PRODUCTION",
]);
const PLACEHOLDER_DATABASE_PASSWORDS = new Set([
  "change-this-db-password",
  "GENERATE_ME_DB_PASSWORD_DO_NOT_USE_IN_PRODUCTION",
]);
const PLACEHOLDER_TWO_FACTOR_ENCRYPTION_KEYS = new Set([
  "GENERATE_ME_DISTINCT_2FA_KEY_DO_NOT_REUSE_SESSION_SECRET",
]);
const PLACEHOLDER_COLLECTION_PII_ENCRYPTION_KEYS = new Set([
  "GENERATE_ME_COLLECTION_PII_KEY_DO_NOT_REUSE_SESSION_SECRET",
]);
const PLACEHOLDER_BACKUP_ENCRYPTION_KEYS = new Set([
  "GENERATE_ME_BACKUP_KEY_AND_STORE_OFFLINE",
]);
const UNSAFE_TRUST_PROXY_VALUES = new Set(["*", "all", "true", "1"]);
const OBVIOUS_PLACEHOLDER_SECRET_PATTERN = /(?:generate[_-]?me|change[_-]?(?:this|me)|replace[_-]?(?:this|me)|do[_-]?not[_-]?use|placeholder-secret|example-secret)/i;
const PRODUCTION_SECRET_MIN_LENGTH = 32;

function isLoopbackHostname(hostname: string) {
  const normalizedHostname = String(hostname || "").trim().replace(/^\[|\]$/g, "").toLowerCase();
  if (!normalizedHostname) {
    return false;
  }

  if (normalizedHostname === "localhost" || normalizedHostname === "::1") {
    return true;
  }

  const ipVersion = isIP(normalizedHostname);
  if (ipVersion === 4) {
    return normalizedHostname.startsWith("127.");
  }

  return false;
}

export function assertSafeOllamaHost(params: {
  allowRemoteHost: boolean;
  isProductionLike: boolean;
  ollamaHost: string | null;
}) {
  if (!params.isProductionLike || !params.ollamaHost) {
    return;
  }

  const url = new URL(params.ollamaHost);
  if (!params.allowRemoteHost && !isLoopbackHostname(url.hostname)) {
    throw new Error(
      "OLLAMA_HOST must stay on a loopback host outside local development unless OLLAMA_ALLOW_REMOTE_HOST=1 is set explicitly.",
    );
  }
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
  trustedProxies: readonly string[];
  publicAppUrl: string | null;
  configuredSessionSecret: string | null;
  configuredCollectionNicknameTempPassword: string | null;
  configuredCollectionPiiEncryptionKey: string | null;
  configuredPgPassword: string | null;
  configuredAuthCookieSecure: string | null;
  configuredOllamaHost: string | null;
  ollamaAllowRemoteHost: boolean;
  remoteErrorTrackingEnabled: boolean;
  remoteErrorTrackingEndpoint: string | null;
  mailConfiguration: MailConfigurationAssessment;
}): RuntimeConfigDiagnostic[] {
  const warnings: RuntimeConfigDiagnostic[] = [];
  const {
    isStrictLocalDevelopment,
    isProductionLike,
    trustedProxies,
    publicAppUrl,
    configuredSessionSecret,
    configuredCollectionNicknameTempPassword,
    configuredCollectionPiiEncryptionKey,
    configuredPgPassword,
    configuredAuthCookieSecure,
    configuredOllamaHost,
    ollamaAllowRemoteHost,
    remoteErrorTrackingEnabled,
    remoteErrorTrackingEndpoint,
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

  if (
    isProductionLike
    && String(publicAppUrl || "").toLowerCase().startsWith("https://")
    && trustedProxies.length === 0
  ) {
    warnings.push({
      code: "TRUSTED_PROXIES_REVIEW_RECOMMENDED",
      envNames: ["PUBLIC_APP_URL", "TRUSTED_PROXIES"],
      message:
        "PUBLIC_APP_URL is using https:// while TRUSTED_PROXIES is empty. If this app is deployed behind a reverse proxy or TLS terminator, configure TRUSTED_PROXIES explicitly so req.ip and forwarded-origin security checks stay accurate.",
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

  if (isProductionLike && /^(?:0|false)$/i.test(String(configuredAuthCookieSecure || "").trim())) {
    warnings.push({
      code: "AUTH_COOKIE_SECURE_FORCED_ON_PRODUCTION",
      envNames: ["AUTH_COOKIE_SECURE"],
      message: "AUTH_COOKIE_SECURE=false was ignored because secure auth cookies are mandatory on production-like hosts.",
      severity: "warning",
    });
  }

  if (
    isProductionLike
    && remoteErrorTrackingEnabled
    && String(remoteErrorTrackingEndpoint || "").trim().toLowerCase().startsWith("http://")
  ) {
    warnings.push({
      code: "REMOTE_ERROR_TRACKING_HTTPS_RECOMMENDED",
      envNames: ["REMOTE_ERROR_TRACKING_ENABLED", "REMOTE_ERROR_TRACKING_ENDPOINT"],
      message: "REMOTE_ERROR_TRACKING_ENDPOINT should use https:// on production-like hosts so telemetry is not sent over plaintext transport.",
      severity: "warning",
    });
  }

  if (
    isProductionLike
    && ollamaAllowRemoteHost
    && configuredOllamaHost
    && !isLoopbackHostname(new URL(configuredOllamaHost).hostname)
  ) {
    warnings.push({
      code: "OLLAMA_REMOTE_HOST_EXPLICITLY_ALLOWED",
      envNames: ["OLLAMA_HOST", "OLLAMA_ALLOW_REMOTE_HOST"],
      message: "OLLAMA_HOST is targeting a non-loopback host on a production-like deployment because OLLAMA_ALLOW_REMOTE_HOST=1 is set explicitly. Review the upstream network policy carefully.",
      severity: "warning",
    });
  }

  if (isProductionLike && String(publicAppUrl || "").trim().toLowerCase().startsWith("https://")) {
    warnings.push({
      code: "HSTS_PRELOAD_REVIEW_RECOMMENDED",
      envNames: ["PUBLIC_APP_URL"],
      message: "HSTS preload is enabled for HTTPS hosts. Confirm the registrable domain meets hstspreload.org requirements before treating preload as operationally active.",
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
  configuredCollectionPiiEncryptionKey: string | null;
  configuredPreviousCollectionPiiEncryptionKeys: readonly string[];
  configuredBackupEncryptionKey: string | null;
  configuredBackupEncryptionKeys: string | null;
}) {
  if (!params.isProductionLike) {
    return;
  }

  const isObviousPlaceholderSecret = (value: string) =>
    OBVIOUS_PLACEHOLDER_SECRET_PATTERN.test(String(value || "").trim().toLowerCase());

  const assertMinimumSecretLength = (
    envName: string,
    value: string | null,
    minimumLength = PRODUCTION_SECRET_MIN_LENGTH,
  ) => {
    const normalizedValue = String(value || "").trim();
    if (!normalizedValue) {
      return;
    }

    if (normalizedValue.length < minimumLength) {
      throw new Error(
        `${envName} must be at least ${minimumLength} characters long on production-like hosts.`,
      );
    }
  };

  if (params.configuredSessionSecret && PLACEHOLDER_SESSION_SECRETS.has(params.configuredSessionSecret)) {
    throw new Error("SESSION_SECRET is using the default placeholder value and must be replaced before non-local startup.");
  }
  if (params.configuredSessionSecret && isObviousPlaceholderSecret(params.configuredSessionSecret)) {
    throw new Error("SESSION_SECRET is using an obvious placeholder/demo value and must be replaced before non-local startup.");
  }
  assertMinimumSecretLength("SESSION_SECRET", params.configuredSessionSecret);

  for (const previousSecret of params.configuredPreviousSessionSecrets) {
    if (PLACEHOLDER_SESSION_SECRETS.has(previousSecret)) {
      throw new Error("SESSION_SECRET_PREVIOUS contains a placeholder value and must be replaced before non-local startup.");
    }
    if (isObviousPlaceholderSecret(previousSecret)) {
      throw new Error("SESSION_SECRET_PREVIOUS contains an obvious placeholder/demo value and must be replaced before non-local startup.");
    }
    assertMinimumSecretLength("SESSION_SECRET_PREVIOUS", previousSecret);
  }

  if (params.configuredPgPassword && PLACEHOLDER_DATABASE_PASSWORDS.has(params.configuredPgPassword)) {
    throw new Error("PG_PASSWORD is using the default placeholder value and must be replaced before non-local startup.");
  }
  if (params.configuredPgPassword && isObviousPlaceholderSecret(params.configuredPgPassword)) {
    throw new Error("PG_PASSWORD is using an obvious placeholder/demo value and must be replaced before non-local startup.");
  }

  if (
    params.configuredTwoFactorEncryptionKey
    && PLACEHOLDER_TWO_FACTOR_ENCRYPTION_KEYS.has(params.configuredTwoFactorEncryptionKey)
  ) {
    throw new Error(
      "TWO_FACTOR_ENCRYPTION_KEY is using the default placeholder value and must be replaced before non-local startup.",
    );
  }
  if (
    params.configuredTwoFactorEncryptionKey
    && isObviousPlaceholderSecret(params.configuredTwoFactorEncryptionKey)
  ) {
    throw new Error(
      "TWO_FACTOR_ENCRYPTION_KEY is using an obvious placeholder/demo value and must be replaced before non-local startup.",
    );
  }
  assertMinimumSecretLength("TWO_FACTOR_ENCRYPTION_KEY", params.configuredTwoFactorEncryptionKey);

  if (
    params.configuredCollectionPiiEncryptionKey
    && PLACEHOLDER_COLLECTION_PII_ENCRYPTION_KEYS.has(params.configuredCollectionPiiEncryptionKey)
  ) {
    throw new Error(
      "COLLECTION_PII_ENCRYPTION_KEY is using the default placeholder value and must be replaced before non-local startup.",
    );
  }
  if (
    params.configuredCollectionPiiEncryptionKey
    && isObviousPlaceholderSecret(params.configuredCollectionPiiEncryptionKey)
  ) {
    throw new Error(
      "COLLECTION_PII_ENCRYPTION_KEY is using an obvious placeholder/demo value and must be replaced before non-local startup.",
    );
  }
  assertMinimumSecretLength(
    "COLLECTION_PII_ENCRYPTION_KEY",
    params.configuredCollectionPiiEncryptionKey,
  );

  for (const previousCollectionPiiKey of params.configuredPreviousCollectionPiiEncryptionKeys) {
    if (PLACEHOLDER_COLLECTION_PII_ENCRYPTION_KEYS.has(previousCollectionPiiKey)) {
      throw new Error(
        "COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS contains a placeholder value and must be replaced before non-local startup.",
      );
    }
    if (isObviousPlaceholderSecret(previousCollectionPiiKey)) {
      throw new Error(
        "COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS contains an obvious placeholder/demo value and must be replaced before non-local startup.",
      );
    }
    assertMinimumSecretLength("COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS", previousCollectionPiiKey);
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
    if (isObviousPlaceholderSecret(backupKey)) {
      throw new Error(
        "BACKUP_ENCRYPTION_KEY or BACKUP_ENCRYPTION_KEYS contains an obvious placeholder/demo value and must be replaced before non-local startup.",
      );
    }
    assertMinimumSecretLength("BACKUP_ENCRYPTION_KEY", backupKey);
  }
}

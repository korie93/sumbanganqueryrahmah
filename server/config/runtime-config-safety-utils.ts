import type { MailConfigurationAssessment, RuntimeConfigDiagnostic } from "./runtime-config-types";
import { normalizeCorsOrigin } from "./runtime-config-read-utils";

const AUTO_COOKIE_SECURE_VALUES = new Set(["", "auto", "1", "true", "0", "false"]);
const PLACEHOLDER_SESSION_SECRETS = new Set(["change-this-session-secret"]);
const PLACEHOLDER_DATABASE_PASSWORDS = new Set(["change-this-db-password"]);
const UNSAFE_TRUST_PROXY_VALUES = new Set(["*", "all", "true", "1"]);

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

export function resolveCookieSecure(
  rawValue: string | null,
  params: { isProduction: boolean; publicAppUrl: string | null },
) {
  const explicit = String(rawValue || "").toLowerCase();
  if (!AUTO_COOKIE_SECURE_VALUES.has(explicit)) {
    throw new Error("AUTH_COOKIE_SECURE must be one of: auto, true, false, 1, or 0.");
  }
  if (explicit === "1" || explicit === "true") {
    return true;
  }
  if (explicit === "0" || explicit === "false") {
    return false;
  }
  return params.isProduction || String(params.publicAppUrl || "").toLowerCase().startsWith("https://");
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
  publicAppUrl: string | null;
  configuredSessionSecret: string | null;
  configuredCollectionNicknameTempPassword: string | null;
  configuredPgPassword: string | null;
  mailConfiguration: MailConfigurationAssessment;
}): RuntimeConfigDiagnostic[] {
  const warnings: RuntimeConfigDiagnostic[] = [];
  const {
    isStrictLocalDevelopment,
    publicAppUrl,
    configuredSessionSecret,
    configuredCollectionNicknameTempPassword,
    configuredPgPassword,
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

  return warnings;
}

export function assertNoPlaceholderSecrets(params: {
  isProductionLike: boolean;
  configuredSessionSecret: string | null;
  configuredPreviousSessionSecrets: readonly string[];
  configuredPgPassword: string | null;
}) {
  if (!params.isProductionLike) {
    return;
  }

  if (params.configuredSessionSecret && PLACEHOLDER_SESSION_SECRETS.has(params.configuredSessionSecret)) {
    throw new Error("SESSION_SECRET is using the default placeholder value and must be replaced before non-local startup.");
  }

  for (const previousSecret of params.configuredPreviousSessionSecrets) {
    if (PLACEHOLDER_SESSION_SECRETS.has(previousSecret)) {
      throw new Error("SESSION_SECRET_PREVIOUS contains a placeholder value and must be replaced before non-local startup.");
    }
  }

  if (params.configuredPgPassword && PLACEHOLDER_DATABASE_PASSWORDS.has(params.configuredPgPassword)) {
    throw new Error("PG_PASSWORD is using the default placeholder value and must be replaced before non-local startup.");
  }
}

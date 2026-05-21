import type { MailConfigurationAssessment } from "./runtime-config-types";
import { assertProductionTwoFactorReplayCacheTopologySafety } from "../auth/two-factor-replay-topology";
import { normalizeCorsOrigin } from "./runtime-config-read-utils";
export {
  assertNoPlaceholderSecrets,
  assertStrongRuntimeSecret,
} from "./runtime-config-secret-safety-utils";
export { buildRuntimeConfigWarnings } from "./runtime-config-warning-utils";

const AUTO_COOKIE_SECURE_VALUES = new Set(["", "auto", "1", "true", "0", "false"]);
const UNSAFE_TRUST_PROXY_VALUES = new Set(["*", "all", "true", "1"]);

export const HSTS_PRELOAD_MIN_MAX_AGE_SECONDS = 31_536_000;
export const HSTS_PRODUCTION_MIN_MAX_AGE_SECONDS = 15_552_000;

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
  const uniquePreviousSecrets: string[] = [];
  const seenPreviousSecrets = new Set<string>();
  for (const value of rawValues) {
    if (normalizedCurrent && value === normalizedCurrent) {
      throw new Error("SESSION_SECRET_PREVIOUS must not include the active SESSION_SECRET value.");
    }
    if (!seenPreviousSecrets.has(value)) {
      seenPreviousSecrets.add(value);
      uniquePreviousSecrets.push(value);
    }
  }

  return uniquePreviousSecrets;
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
  operationsDebugRoutesEnabled: boolean;
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

  if (isProductionLike && params.operationsDebugRoutesEnabled) {
    throw new Error(
      "OPERATIONS_DEBUG_ROUTES_ENABLED is not allowed on production-like hosts.",
    );
  }

  if (!isStrictLocalDevelopment && mailConfiguration.isIncomplete) {
    throw new Error(
      "SMTP mail configuration is incomplete. Configure MAIL_FROM/SMTP_* fully or clear the SMTP env vars entirely before startup.",
    );
  }
}

export function assertProductionRateLimiterTopologySafety(params: {
  isProductionLike: boolean;
  configuredClusterMaxWorkers: number;
  distributedStoreConfigured: boolean;
}) {
  if (
    !params.isProductionLike
    || params.distributedStoreConfigured
    || params.configuredClusterMaxWorkers <= 1
  ) {
    return;
  }

  throw new Error(
    "SQR_MAX_WORKERS greater than 1 is not allowed outside strict local development until a shared rate-limit/replay store is configured. Login/auth route limiters, adaptive API protection, telemetry drop guards, and 2FA replay protection are still process-local. Set SQR_MAX_WORKERS=1 or add shared limiter infrastructure before scaling horizontally.",
  );
}

export function assertProductionTwoFactorReplayTopologySafety(params: {
  isProductionLike: boolean;
  configuredClusterMaxWorkers: number;
  sharedReplayStoreConfigured: boolean;
}) {
  assertProductionTwoFactorReplayCacheTopologySafety({
    isProductionLike: params.isProductionLike,
    sharedReplayStoreConfigured: params.sharedReplayStoreConfigured,
    workerCount: params.configuredClusterMaxWorkers,
  });
}

export function assertProductionDatabaseBootstrapModeSafety(params: {
  isProductionLike: boolean;
  databaseBootstrapMode: "runtime" | "migration";
  allowRuntimeBootstrapInProduction: boolean;
}) {
  if (
    !params.isProductionLike
    || params.databaseBootstrapMode !== "runtime"
    || params.allowRuntimeBootstrapInProduction
  ) {
    return;
  }

  throw new Error(
    "SQR_DB_BOOTSTRAP_MODE=runtime is not allowed on production-like hosts without SQR_ALLOW_RUNTIME_DB_BOOTSTRAP_IN_PRODUCTION=1. Run npm run db:migrate before startup and use SQR_DB_BOOTSTRAP_MODE=migration; reserve runtime bootstrap only for a deliberate legacy recovery window.",
  );
}

import os from "node:os";
import path from "node:path";
import {
  isProductionLikeEnvironment,
  isStrictLocalDevelopmentEnvironment,
} from "./runtime-environment";
import { validateRuntimeEnvironmentSchema } from "./runtime-env-schema";
import { resolveUploadsRootDir } from "./upload-paths";
import { DEFAULT_IMPORT_BODY_LIMIT } from "./body-limit";
import { parseBodyLimitToBytes, DEFAULT_IMPORT_UPLOAD_LIMIT_BYTES } from "./body-limit";
import {
  buildEphemeralSecret,
  normalizeHttpUrl,
  readBoolean,
  readCommaSeparatedList,
  readInt,
  readOptionalString,
  readSecretOrThrow,
  readString,
  resolveNodeEnv,
} from "./runtime-config-read-utils";
import {
  assessMailConfiguration,
  assertNoPlaceholderSecrets,
  assertRuntimeSafetyGuards,
  buildRuntimeConfigWarnings,
  hasBackupEncryptionKeyConfigured,
  hasCollectionPiiEncryptionKeyConfigured,
  hasTwoFactorEncryptionKeyConfigured,
  resolveCookieSecure,
  resolveCorsAllowedOrigins,
  resolvePreviousCollectionPiiSecrets,
  resolvePreviousSessionSecrets,
  resolveTrustedProxies,
} from "./runtime-config-safety-utils";
import type {
  RuntimeConfig,
  RuntimeConfigValidation as RuntimeConfigValidationType,
} from "./runtime-config-types";

export type { RuntimeConfigDiagnostic, RuntimeConfigValidation } from "./runtime-config-types";

validateRuntimeEnvironmentSchema();

const COLLECTION_PII_FIELD_NAMES = new Set([
  "customerName",
  "icNumber",
  "customerPhone",
  "accountNumber",
]);

const nodeEnv = resolveNodeEnv();
const isProduction = nodeEnv === "production";
const isStrictLocalDevelopment = isStrictLocalDevelopmentEnvironment();
const isProductionLike = isProductionLikeEnvironment();
const debugLogs = readBoolean("DEBUG_LOGS", false) && !isProductionLike;
const operationsDebugRoutesEnabled = !isProductionLike
  && readBoolean("OPERATIONS_DEBUG_ROUTES_ENABLED", false);
const logLevel = readString("LOG_LEVEL", debugLogs ? "debug" : "info");
const lowMemoryMode = readBoolean("SQR_LOW_MEMORY_MODE", true);
const seedDefaultUsers = readBoolean("SEED_DEFAULT_USERS", false);
const backupFeatureEnabled = readBoolean("BACKUP_FEATURE_ENABLED", true);
const localSuperuserCredentialsFileEnabled = readBoolean("LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED", false);
const mailDevOutboxEnabled = readBoolean("MAIL_DEV_OUTBOX_ENABLED", false);
const requestedDbQueryProfilingEnabled = readBoolean("DB_QUERY_PROFILING_ENABLED", false);
const allowDbQueryProfilingInProduction = readBoolean("DB_QUERY_PROFILING_ALLOW_IN_PRODUCTION", false);
const dbQueryProfilingEnabled =
  requestedDbQueryProfilingEnabled && (!isProduction || allowDbQueryProfilingInProduction);
const remoteErrorTrackingEnabled = readBoolean("REMOTE_ERROR_TRACKING_ENABLED", false);
const remoteErrorTrackingEndpoint = normalizeHttpUrl(
  "REMOTE_ERROR_TRACKING_ENDPOINT",
  readOptionalString("REMOTE_ERROR_TRACKING_ENDPOINT"),
);

if (remoteErrorTrackingEnabled && !remoteErrorTrackingEndpoint) {
  throw new Error(
    "REMOTE_ERROR_TRACKING_ENDPOINT is required when REMOTE_ERROR_TRACKING_ENABLED=1.",
  );
}
const resolvedDefaultImportUploadLimitBytes = parseBodyLimitToBytes(
  readString("IMPORT_BODY_LIMIT", DEFAULT_IMPORT_BODY_LIMIT),
  DEFAULT_IMPORT_UPLOAD_LIMIT_BYTES,
);

type ParsedDatabaseUrl = {
  database: string;
  host: string;
  password: string;
  port: number;
  user: string;
};

function parseDatabaseUrl(rawValue: string | null): ParsedDatabaseUrl | null {
  if (!rawValue) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(rawValue);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL.");
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("DATABASE_URL must start with postgres:// or postgresql://.");
  }

  const pathname = url.pathname.replace(/^\/+/, "");
  const port = Number.parseInt(url.port || "5432", 10);

  return {
    database: decodeURIComponent(pathname),
    host: url.hostname,
    password: decodeURIComponent(url.password || ""),
    port: Number.isFinite(port) ? port : 5432,
    user: decodeURIComponent(url.username || ""),
  };
}

function resolveDefaultPgMaxConnections() {
  const cpuCount = typeof os.availableParallelism === "function"
    ? os.availableParallelism()
    : os.cpus().length;
  const normalizedCpuCount = Math.max(1, Number.isFinite(cpuCount) ? Math.trunc(cpuCount) : 1);
  return Math.min(50, Math.max(10, normalizedCpuCount * 2));
}

const configuredSessionSecret = readOptionalString("SESSION_SECRET");
const configuredPreviousSessionSecrets = resolvePreviousSessionSecrets(
  readCommaSeparatedList("SESSION_SECRET_PREVIOUS"),
  configuredSessionSecret,
);
const configuredDatabaseUrl = readOptionalString("DATABASE_URL");
const parsedDatabaseUrl = parseDatabaseUrl(configuredDatabaseUrl);
const configuredCollectionNicknameTempPassword = readOptionalString("COLLECTION_NICKNAME_TEMP_PASSWORD");
const configuredPgPassword = readOptionalString("PG_PASSWORD");
const configuredTwoFactorEncryptionKey = readOptionalString("TWO_FACTOR_ENCRYPTION_KEY");
const configuredCollectionPiiEncryptionKey = readOptionalString("COLLECTION_PII_ENCRYPTION_KEY");
const configuredPreviousCollectionPiiEncryptionKeys = resolvePreviousCollectionPiiSecrets(
  readCommaSeparatedList("COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS"),
  configuredCollectionPiiEncryptionKey,
);
const configuredCollectionPiiRetiredFields = readCommaSeparatedList("COLLECTION_PII_RETIRED_FIELDS")
  .filter((field) => COLLECTION_PII_FIELD_NAMES.has(field));
const configuredBackupEncryptionKey = readOptionalString("BACKUP_ENCRYPTION_KEY");
const configuredBackupEncryptionKeys = readOptionalString("BACKUP_ENCRYPTION_KEYS");
const configuredCollectionReceiptQuarantineDir = readOptionalString("COLLECTION_RECEIPT_QUARANTINE_DIR");
const resolvedCollectionReceiptQuarantineDir = configuredCollectionReceiptQuarantineDir
  ? path.resolve(process.cwd(), configuredCollectionReceiptQuarantineDir)
  : path.resolve(process.cwd(), "var", "collection-receipt-quarantine");
const configuredMailDevOutboxDir = readOptionalString("MAIL_DEV_OUTBOX_DIR");
const resolvedMailDevOutboxDir = configuredMailDevOutboxDir
  ? path.resolve(configuredMailDevOutboxDir)
  : path.resolve(process.cwd(), "var", "dev-mail-outbox");
const publicAppUrl = normalizeHttpUrl("PUBLIC_APP_URL", readOptionalString("PUBLIC_APP_URL"));
const trustedProxies = resolveTrustedProxies(readCommaSeparatedList("TRUSTED_PROXIES"));
const corsAllowedOrigins = resolveCorsAllowedOrigins({
  rawValue: readOptionalString("CORS_ALLOWED_ORIGINS"),
  publicAppUrl,
});
const configuredAuthCookieSecure = readOptionalString("AUTH_COOKIE_SECURE");
const cookieSecure = resolveCookieSecure(configuredAuthCookieSecure, {
  isProductionLike,
  publicAppUrl,
});

const mailConfiguration = assessMailConfiguration({
  smtpService: readOptionalString("SMTP_SERVICE"),
  smtpHost: readOptionalString("SMTP_HOST"),
  smtpUser: readOptionalString("SMTP_USER"),
  smtpPassword: readOptionalString("SMTP_PASSWORD"),
  mailFrom: readOptionalString("MAIL_FROM"),
});

assertRuntimeSafetyGuards({
  isProductionLike,
  isStrictLocalDevelopment,
  mailConfiguration,
  backupFeatureEnabled,
  hasBackupEncryptionKeyConfigured: hasBackupEncryptionKeyConfigured({
    configuredBackupEncryptionKey,
    configuredBackupEncryptionKeys,
  }),
  hasCollectionPiiEncryptionKeyConfigured: hasCollectionPiiEncryptionKeyConfigured({
    configuredCollectionPiiEncryptionKey,
  }),
  hasTwoFactorEncryptionKeyConfigured: hasTwoFactorEncryptionKeyConfigured({
    configuredTwoFactorEncryptionKey,
  }),
  seedDefaultUsers,
  localSuperuserCredentialsFileEnabled,
  mailDevOutboxEnabled,
});

assertNoPlaceholderSecrets({
  isProductionLike,
  configuredSessionSecret,
  configuredPreviousSessionSecrets,
  configuredPgPassword,
  configuredTwoFactorEncryptionKey,
  configuredCollectionPiiEncryptionKey,
  configuredPreviousCollectionPiiEncryptionKeys,
  configuredBackupEncryptionKey,
  configuredBackupEncryptionKeys,
});

export const runtimeConfig: RuntimeConfig = Object.freeze({
  app: {
    nodeEnv,
    isProduction,
    isProductionLike,
    isStrictLocalDevelopment,
    port: readInt("PORT", 5000, { min: 1, max: 65535 }),
    host: readString("HOST", "0.0.0.0"),
    publicAppUrl,
    debugLogs,
    operationsDebugRoutesEnabled,
    logLevel,
    allowLocalDevCors: readBoolean("ALLOW_LOCAL_DEV_CORS", false),
    uploadsRootDir: resolveUploadsRootDir(),
    bodyLimits: {
      default: readString("DEFAULT_BODY_LIMIT", "2mb"),
      imports: readString("IMPORT_BODY_LIMIT", DEFAULT_IMPORT_BODY_LIMIT),
      collection: readString("COLLECTION_BODY_LIMIT", "8mb"),
    },
    corsAllowedOrigins,
    trustedProxies,
  },
  database: {
    connectionString: configuredDatabaseUrl,
    host: readString("PG_HOST", parsedDatabaseUrl?.host || "localhost"),
    port: readInt("PG_PORT", parsedDatabaseUrl?.port || 5432, { min: 1, max: 65535 }),
    user: readString("PG_USER", parsedDatabaseUrl?.user || "postgres"),
    password: (() => {
      if (configuredPgPassword) {
        return configuredPgPassword;
      }
      if (parsedDatabaseUrl?.password) {
        return parsedDatabaseUrl.password;
      }
      if (isProductionLike) {
        throw new Error("PG_PASSWORD or DATABASE_URL password is required outside strict local development.");
      }
      // Keep the local-development path passwordless-friendly while ensuring pg
      // always receives a string and can surface a normal auth failure instead
      // of throwing on undefined during SCRAM negotiation.
      return "";
    })(),
    database: readString("PG_DATABASE", parsedDatabaseUrl?.database || "sqr_db"),
    maxConnections: readInt("PG_MAX_CONNECTIONS", resolveDefaultPgMaxConnections(), { min: 1, max: 50 }),
    idleTimeoutMs: readInt("PG_IDLE_TIMEOUT_MS", 30_000, { min: 1_000 }),
    connectionTimeoutMs: readInt("PG_CONNECTION_TIMEOUT_MS", 5_000, { min: 1_000 }),
    queryTimeoutMs: readInt("PG_QUERY_TIMEOUT_MS", 120_000, { min: 1_000 }),
    statementTimeoutMs: readInt("PG_STATEMENT_TIMEOUT_MS", 90_000, { min: 1_000 }),
    searchPath: readString("PG_SEARCH_PATH", "public"),
  },
  auth: {
    sessionSecret: readSecretOrThrow("SESSION_SECRET", isProductionLike, () => buildEphemeralSecret("session")),
    previousSessionSecrets: configuredPreviousSessionSecrets,
    collectionNicknameTempPassword: readSecretOrThrow(
      "COLLECTION_NICKNAME_TEMP_PASSWORD",
      isProductionLike,
      () => buildEphemeralSecret("collection-temp").slice(0, 16),
    ),
    twoFactorEncryptionSecret: configuredTwoFactorEncryptionKey,
    seedDefaultUsers,
    cookieSecure,
  },
  ai: {
    host: normalizeHttpUrl("OLLAMA_HOST", readOptionalString("OLLAMA_HOST")) ?? "http://127.0.0.1:11434",
    chatModel: readString("OLLAMA_CHAT_MODEL", "llama3:8b"),
    embedModel: readString("OLLAMA_EMBED_MODEL", "nomic-embed-text"),
    timeoutMs: readInt("OLLAMA_TIMEOUT_MS", 6_000, { min: 1_000 }),
    precomputeOnStart: readBoolean("AI_PRECOMPUTE_ON_START", false),
    lowMemoryMode,
    debugLogs,
    debugEnabled: readBoolean("AI_DEBUG", false),
    intentMode: readOptionalString("AI_INTENT_MODE"),
    gate: {
      globalLimit: readInt("AI_GATE_GLOBAL_LIMIT", 4, { min: 1 }),
      queueLimit: readInt("AI_GATE_QUEUE_LIMIT", 20, { min: 0 }),
      queueWaitMs: readInt("AI_GATE_QUEUE_WAIT_MS", 12_000, { min: 1_000 }),
      roleLimits: {
        user: readInt("AI_GATE_USER_LIMIT", 2, { min: 1 }),
        admin: readInt("AI_GATE_ADMIN_LIMIT", 1, { min: 1 }),
        superuser: readInt("AI_GATE_SUPERUSER_LIMIT", 1, { min: 1 }),
      },
    },
    latency: {
      staleAfterMs: readInt("AI_LATENCY_STALE_AFTER_MS", 20_000, { min: 5_000 }),
      decayHalfLifeMs: readInt("AI_LATENCY_DECAY_HALF_LIFE_MS", 30_000, { min: 5_000 }),
    },
    cache: {
      maxSearchEntries: readInt("SQR_MAX_SEARCH_CACHE_ENTRIES", lowMemoryMode ? 60 : 180, { min: 10 }),
      maxLastPersonEntries: readInt("SQR_MAX_AI_LAST_PERSON_ENTRIES", lowMemoryMode ? 40 : 120, { min: 10 }),
      lastPersonTtlMs: readInt("SQR_AI_LAST_PERSON_TTL_MS", 1_800_000, { min: 60_000 }),
    },
  },
  observability: {
    clientErrorTelemetryEnabled: readBoolean("CLIENT_ERROR_TELEMETRY_ENABLED", false),
    remoteErrorTracking: {
      enabled: remoteErrorTrackingEnabled,
      endpoint: remoteErrorTrackingEndpoint,
      timeoutMs: readInt("REMOTE_ERROR_TRACKING_TIMEOUT_MS", 3_000, {
        min: 500,
        max: 30_000,
      }),
    },
  },
  runtime: {
    defaults: {
      sessionTimeoutMinutes: readInt("DEFAULT_SESSION_TIMEOUT_MINUTES", 30, { min: 1 }),
      wsIdleMinutes: readInt("DEFAULT_WS_IDLE_MINUTES", 3, { min: 1 }),
      aiTimeoutMs: readInt("DEFAULT_AI_TIMEOUT_MS", 6_000, { min: 1_000 }),
      searchResultLimit: readInt("DEFAULT_SEARCH_RESULT_LIMIT", 200, { min: 10, max: 5000 }),
      viewerRowsPerPage: readInt("DEFAULT_VIEWER_ROWS_PER_PAGE", 100, { min: 10, max: 500 }),
    },
    maintenanceCacheTtlMs: readInt("MAINTENANCE_CACHE_TTL_MS", 3_000, { min: 500 }),
    runtimeSettingsCacheTtlMs: readInt("RUNTIME_SETTINGS_CACHE_TTL_MS", 3_000, { min: 500 }),
    pgPoolWarnCooldownMs: readInt("PG_POOL_WARN_COOLDOWN_MS", 60_000, { min: 1_000 }),
    pgPoolAlertWaitingCount: readInt("PG_POOL_ALERT_WAITING_COUNT", 2, { min: 1, max: 1_000 }),
    pgPoolAlertUtilizationPercent: readInt("PG_POOL_ALERT_UTILIZATION_PERCENT", 100, {
      min: 50,
      max: 100,
    }),
    pgPoolHealthCheckIntervalMs: readInt("PG_POOL_HEALTH_CHECK_INTERVAL_MS", 60_000, { min: 1_000 }),
    pgPoolHealthCheckTimeoutMs: readInt("PG_POOL_HEALTH_CHECK_TIMEOUT_MS", 5_000, { min: 250 }),
    gracefulShutdownTimeoutMs: readInt("GRACEFUL_SHUTDOWN_TIMEOUT_MS", 25_000, { min: 1_000 }),
    backupOperationTimeoutMs: readInt("BACKUP_OPERATION_TIMEOUT_MS", 120_000, { min: 5_000 }),
    backupRestoreSlowTransactionMs: readInt("BACKUP_RESTORE_SLOW_TRANSACTION_MS", 15_000, { min: 1_000 }),
    backupRestoreMaxTrackedCollectionRecordIds: readInt(
      "BACKUP_RESTORE_MAX_TRACKED_COLLECTION_RECORD_IDS",
      lowMemoryMode ? 100_000 : 250_000,
      { min: 1_000, max: 2_000_000 },
    ),
    backupMaxPayloadBytes: readInt(
      "BACKUP_MAX_PAYLOAD_BYTES",
      lowMemoryMode ? 32 * 1024 * 1024 : 128 * 1024 * 1024,
      { min: 1_048_576, max: 536_870_912 },
    ),
    importCsvMaxRows: readInt("IMPORT_CSV_MAX_ROWS", lowMemoryMode ? 100_000 : 250_000, {
      min: 1,
      max: 1_000_000,
    }),
    importPerUserActiveUploadBytes: readInt(
      "IMPORT_PER_USER_ACTIVE_UPLOAD_BYTES",
      resolvedDefaultImportUploadLimitBytes,
      { min: 1_048_576, max: 536_870_912 },
    ),
    importAnalysisTimeoutMs: readInt("IMPORT_ANALYSIS_TIMEOUT_MS", 45_000, { min: 5_000 }),
    collectionRollupListenReconnectMs: readInt("COLLECTION_ROLLUP_LISTEN_RECONNECT_MS", 5_000, { min: 1_000 }),
    httpSlowRequestMs: readInt("HTTP_SLOW_REQUEST_MS", 1_500, { min: 250 }),
    requestTimeoutMs: readInt("HTTP_REQUEST_TIMEOUT_MS", 30_000, { min: 1_000 }),
    analyticsTimeZone: readString("ANALYTICS_TZ", "Asia/Kuala_Lumpur"),
    dbQueryProfiling: {
      enabled: dbQueryProfilingEnabled,
      samplePercent: readInt("DB_QUERY_PROFILING_SAMPLE_PERCENT", 100, { min: 0, max: 100 }),
      minQueryCount: readInt("DB_QUERY_PROFILING_MIN_QUERY_COUNT", 8, { min: 1 }),
      minTotalQueryMs: readInt("DB_QUERY_PROFILING_MIN_TOTAL_QUERY_MS", 40, { min: 0 }),
      repeatedStatementThreshold: readInt("DB_QUERY_PROFILING_REPEATED_STATEMENT_THRESHOLD", 3, {
        min: 2,
      }),
      maxLoggedStatements: readInt("DB_QUERY_PROFILING_MAX_LOGGED_STATEMENTS", 5, {
        min: 1,
        max: 20,
      }),
      maxUniqueStatements: readInt("DB_QUERY_PROFILING_MAX_UNIQUE_STATEMENTS", 250, {
        min: 10,
        max: 1_000,
      }),
    },
  },
  collection: {
    routeWarnMs: readInt("COLLECTION_ROUTE_WARN_MS", 750, { min: 250 }),
    receiptQuarantineEnabled: readBoolean("COLLECTION_RECEIPT_QUARANTINE_ENABLED", true),
    receiptQuarantineDir: resolvedCollectionReceiptQuarantineDir,
    piiEncryptionSecret: configuredCollectionPiiEncryptionKey,
    previousPiiEncryptionSecrets: configuredPreviousCollectionPiiEncryptionKeys,
    piiRetiredFields: configuredCollectionPiiRetiredFields,
  },
  mail: {
    devOutboxEnabled: mailDevOutboxEnabled,
    devOutboxDir: resolvedMailDevOutboxDir,
    devOutboxMaxFiles: readInt("MAIL_DEV_OUTBOX_MAX_FILES", 50, { min: 1, max: 10_000 }),
    transport: {
      from: mailConfiguration.effectiveFrom,
      service: readOptionalString("SMTP_SERVICE"),
      host: readOptionalString("SMTP_HOST"),
      port: readInt("SMTP_PORT", 587, { min: 1, max: 65_535 }),
      user: readOptionalString("SMTP_USER"),
      password: readOptionalString("SMTP_PASSWORD"),
      secure: readBoolean("SMTP_SECURE", readInt("SMTP_PORT", 587, { min: 1, max: 65_535 }) === 465),
      requireTls: readBoolean("SMTP_REQUIRE_TLS", false),
    },
  },
  backups: {
    featureEnabled: backupFeatureEnabled,
    encryptionKey: configuredBackupEncryptionKey,
    encryptionKeys: configuredBackupEncryptionKeys,
    encryptionKeyId: readOptionalString("BACKUP_ENCRYPTION_KEY_ID"),
  },
  cluster: {
    lowMemoryMode,
    maxWorkers: readInt("SQR_MAX_WORKERS", lowMemoryMode ? 1 : 4, { min: 1 }),
    initialWorkers: readInt("SQR_INITIAL_WORKERS", 1, { min: 1 }),
    preallocateMb: readInt("SQR_PREALLOCATE_MB", lowMemoryMode ? 0 : 32, { min: 0 }),
    forceCluster: readBoolean("SQR_FORCE_CLUSTER", false),
  },
  bootstrap: {
    localSuperuserCredentialsFileEnabled,
    users: {
      superuser: {
        username: readString("SEED_SUPERUSER_USERNAME", "superuser"),
        password: readString("SEED_SUPERUSER_PASSWORD", ""),
        fullName: readString("SEED_SUPERUSER_FULL_NAME", "Superuser"),
        twoFactorSecret: readOptionalString("SEED_SUPERUSER_TWO_FACTOR_SECRET"),
      },
      admin: {
        username: readString("SEED_ADMIN_USERNAME", "admin1"),
        password: readString("SEED_ADMIN_PASSWORD", ""),
        fullName: readString("SEED_ADMIN_FULL_NAME", "Admin"),
        twoFactorSecret: readOptionalString("SEED_ADMIN_TWO_FACTOR_SECRET"),
      },
      user: {
        username: readString("SEED_USER_USERNAME", "user1"),
        password: readString("SEED_USER_PASSWORD", ""),
        fullName: readString("SEED_USER_FULL_NAME", "User"),
        twoFactorSecret: null,
      },
    },
    freshLocalSuperuser: {
      username: readString("SEED_SUPERUSER_USERNAME", "superuser"),
      password: readString("SEED_SUPERUSER_PASSWORD", ""),
      fullName: readString("SEED_SUPERUSER_FULL_NAME", "Local Superuser"),
      twoFactorSecret: readOptionalString("SEED_SUPERUSER_TWO_FACTOR_SECRET"),
    },
  },
});

const runtimeWarnings = buildRuntimeConfigWarnings({
  isStrictLocalDevelopment,
  isProductionLike,
  trustedProxies,
  publicAppUrl,
  configuredSessionSecret,
  configuredCollectionNicknameTempPassword,
  configuredCollectionPiiEncryptionKey,
  configuredPgPassword,
  configuredAuthCookieSecure,
  remoteErrorTrackingEnabled,
  remoteErrorTrackingEndpoint,
  mailConfiguration,
});

if (isProduction && requestedDbQueryProfilingEnabled && !allowDbQueryProfilingInProduction) {
  runtimeWarnings.push({
    code: "db-query-profiling-production-forced-off",
    envNames: ["NODE_ENV", "DB_QUERY_PROFILING_ENABLED", "DB_QUERY_PROFILING_ALLOW_IN_PRODUCTION"],
    message:
      "DB query profiling was forced off because production only allows temporary profiling when DB_QUERY_PROFILING_ALLOW_IN_PRODUCTION=1 is set explicitly.",
    severity: "warning",
  });
}

export const runtimeConfigValidation: RuntimeConfigValidationType = Object.freeze({
  warningCount: runtimeWarnings.length,
  warnings: Object.freeze(runtimeWarnings.map((warning) => Object.freeze({ ...warning }))),
});

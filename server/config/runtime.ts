import path from "node:path";
import {
  isProductionLikeEnvironment,
  isStrictLocalDevelopmentEnvironment,
} from "./runtime-environment";
import { resolveDatabaseSslConfig } from "./database-ssl";
import {
  MAX_SESSION_TIMEOUT_MINUTES,
  MIN_SESSION_TIMEOUT_MINUTES,
  validateRuntimeEnvironmentSchema,
} from "./runtime-env-schema";
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
  readIntFrom,
  readOptionalStringFrom,
  readStringFrom,
} from "./runtime-config-read-alias-utils";
import {
  assertPostgresRuntimeCredentialFormat,
  parseDatabaseUrl,
  resolveCookieSameSite,
  resolveDatabaseBootstrapMode,
  resolveDefaultPgMaxConnections,
  resolveTwoFactorTotpAlgorithm,
} from "./runtime-config-resolvers";
import { isAllowedCollectionPiiRetiredField } from "./collection-pii-field-config";
import {
  assessMailConfiguration,
  assertNoPlaceholderSecrets,
  assertProductionDatabaseBootstrapModeSafety,
  assertProductionRateLimiterTopologySafety,
  assertProductionReceiptExternalScanSafety,
  assertProductionTwoFactorReplayTopologySafety,
  assertProductionWebSocketRuntimeTopologySafety,
  assertRateLimiterMultiWorkerTopologySafety,
  assertRuntimeSessionSecretMinBytes,
  assertRuntimeSafetyGuards,
  buildRuntimeConfigWarnings,
  hasBackupEncryptionKeyConfigured,
  hasCollectionPiiEncryptionKeyConfigured,
  hasTwoFactorEncryptionKeyConfigured,
  HSTS_PRODUCTION_MIN_MAX_AGE_SECONDS,
  resolveHstsHeaderConfig,
  resolveCookieSecure,
  resolveCorsAllowedOrigins,
  resolvePreviousCollectionPiiSecrets,
  resolvePreviousSessionSecrets,
  resolveTrustedProxies,
} from "./runtime-config-safety-utils";
import { resolveSharedRateLimitStoreConfig } from "../middleware/rate-limit-runtime";
import { resolveRuntimeWsSharedBusConfig } from "../ws/runtime-shared-bus-config";
import {
  DEFAULT_RUNTIME_WS_MAX_CONNECTIONS,
  DEFAULT_RUNTIME_WS_MAX_MESSAGE_BYTES,
} from "../ws/runtime-manager-types";
import type {
  RuntimeConfig,
  RuntimeConfigValidation as RuntimeConfigValidationType,
} from "./runtime-config-types";

export type { RuntimeConfigDiagnostic, RuntimeConfigValidation } from "./runtime-config-types";

validateRuntimeEnvironmentSchema();

const MIN_COUNT = 1;
const MIN_ZERO_COUNT = 0;
const DEFAULT_LOW_MEMORY_WORKERS = 1;
const DEFAULT_STANDARD_WORKERS = 4;
const DEFAULT_HTTP_PORT = 5_000;
const DEFAULT_POSTGRES_PORT = 5_432;
const DEFAULT_SMTP_PORT = 587;
const SMTPS_PORT = 465;
const MAX_TCP_PORT = 65_535;
const MAX_HSTS_MAX_AGE_SECONDS = HSTS_PRODUCTION_MIN_MAX_AGE_SECONDS * 2;
const MIN_TIMEOUT_MS = 1_000;
const ONE_KIB_BYTES = 1_024;
const ONE_MIB_BYTES = ONE_KIB_BYTES * ONE_KIB_BYTES;
const LOW_MEMORY_BACKUP_MAX_PAYLOAD_BYTES = 32 * ONE_MIB_BYTES;
const STANDARD_BACKUP_MAX_PAYLOAD_BYTES = 128 * ONE_MIB_BYTES;
const MAX_CONFIGURED_PAYLOAD_BYTES = 512 * ONE_MIB_BYTES;
const DEFAULT_IMPORT_MAX_ROW_BYTES = 64 * ONE_KIB_BYTES;
const MAX_IMPORT_MAX_ROW_BYTES = ONE_MIB_BYTES;
const DEBUG_LOG_LEVELS = new Set(["debug", "trace"]);

function resolveRuntimeLogLevel(configuredLogLevel: string, productionLike: boolean): string {
  const normalizedLogLevel = configuredLogLevel.trim().toLowerCase();
  if (productionLike && DEBUG_LOG_LEVELS.has(normalizedLogLevel)) {
    return "info";
  }

  return configuredLogLevel;
}

const nodeEnv = resolveNodeEnv();
const isProduction = nodeEnv === "production";
const isStrictLocalDevelopment = isStrictLocalDevelopmentEnvironment();
const isProductionLike = isProductionLikeEnvironment();
const debugLogs = readBoolean("DEBUG_LOGS", false) && !isProductionLike;
const operationsDebugRoutesEnabled = readBoolean("OPERATIONS_DEBUG_ROUTES_ENABLED", false);
const operationsDebugAccessToken = readOptionalString("OPERATIONS_DEBUG_ACCESS_TOKEN");
const configuredOperationsDebugAllowedIps = readCommaSeparatedList("OPERATIONS_DEBUG_ALLOWED_IPS");
const logLevel = resolveRuntimeLogLevel(
  readString("LOG_LEVEL", debugLogs ? "debug" : "info"),
  isProductionLike,
);
const lowMemoryMode = readBoolean("SQR_LOW_MEMORY_MODE", true);
const configuredClusterMaxWorkers = readInt(
  "SQR_MAX_WORKERS",
  lowMemoryMode ? DEFAULT_LOW_MEMORY_WORKERS : DEFAULT_STANDARD_WORKERS,
  { min: MIN_COUNT },
);
const seedDefaultUsers = readBoolean("SEED_DEFAULT_USERS", false);
const backupFeatureEnabled = readBoolean("BACKUP_FEATURE_ENABLED", true);
const localSuperuserCredentialsFileEnabled = readBoolean("LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED", false);
const mailDevOutboxEnabled = readBoolean("MAIL_DEV_OUTBOX_ENABLED", false);
const hstsHeaderConfig = resolveHstsHeaderConfig({
  isProductionLike,
  maxAgeSeconds: readInt("HSTS_MAX_AGE_SECONDS", HSTS_PRODUCTION_MIN_MAX_AGE_SECONDS, {
    min: MIN_ZERO_COUNT,
    max: MAX_HSTS_MAX_AGE_SECONDS,
  }),
  preloadEnabled: readBoolean("HSTS_PRELOAD_ENABLED", false),
});
const resolvedDefaultImportUploadLimitBytes = parseBodyLimitToBytes(
  readString("IMPORT_BODY_LIMIT", DEFAULT_IMPORT_BODY_LIMIT),
  DEFAULT_IMPORT_UPLOAD_LIMIT_BYTES,
);

const configuredSessionSecret = readOptionalString("SESSION_SECRET");
const configuredPreviousSessionSecrets = resolvePreviousSessionSecrets(
  readCommaSeparatedList("SESSION_SECRET_PREVIOUS"),
  configuredSessionSecret,
);
const configuredDatabaseUrl = readOptionalString("DATABASE_URL");
const parsedDatabaseUrl = parseDatabaseUrl(configuredDatabaseUrl);
const databaseSslConfig = resolveDatabaseSslConfig(readOptionalString("DATABASE_SSL"), {
  ca: readOptionalString("DATABASE_SSL_CA"),
  caFile: readOptionalString("DATABASE_SSL_CA_FILE"),
  isProductionLike,
});
const configuredCollectionNicknameTempPassword = readOptionalString("COLLECTION_NICKNAME_TEMP_PASSWORD");
const configuredPgPassword = readOptionalStringFrom(["PG_PASSWORD", "PGPASSWORD"]);
const configuredTwoFactorEncryptionKey = readOptionalString("TWO_FACTOR_ENCRYPTION_KEY");
const configuredPreviousTwoFactorEncryptionKeys = readCommaSeparatedList(
  "TWO_FACTOR_ENCRYPTION_KEY_PREVIOUS",
);
const configuredTwoFactorTotpAlgorithm = readOptionalString("TWO_FACTOR_TOTP_ALGORITHM");
const configuredCollectionPiiEncryptionKey = readOptionalString("COLLECTION_PII_ENCRYPTION_KEY");
const configuredPreviousCollectionPiiEncryptionKeys = resolvePreviousCollectionPiiSecrets(
  readCommaSeparatedList("COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS"),
  configuredCollectionPiiEncryptionKey,
);
const configuredCollectionPiiRetiredFields = readCommaSeparatedList("COLLECTION_PII_RETIRED_FIELDS")
  .filter(isAllowedCollectionPiiRetiredField);
const configuredBackupEncryptionKey = readOptionalString("BACKUP_ENCRYPTION_KEY");
const configuredBackupEncryptionKeys = readOptionalString("BACKUP_ENCRYPTION_KEYS");
const configuredCollectionReceiptQuarantineDir = readOptionalString("COLLECTION_RECEIPT_QUARANTINE_DIR");
const resolvedCollectionReceiptQuarantineDir = configuredCollectionReceiptQuarantineDir
  ? path.resolve(process.cwd(), configuredCollectionReceiptQuarantineDir)
  : path.resolve(process.cwd(), "var", "collection-receipt-quarantine");
const collectionReceiptExternalScanEnabled = readBoolean("COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED", false);
const collectionReceiptExternalScanCommand = readOptionalString("COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND");
const collectionReceiptExternalScanArgsJson = readOptionalString("COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON");
const collectionReceiptExternalScanFailClosed = readBoolean("COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED", true);
const configuredMailDevOutboxDir = readOptionalString("MAIL_DEV_OUTBOX_DIR");
const resolvedMailDevOutboxDir = configuredMailDevOutboxDir
  ? path.resolve(configuredMailDevOutboxDir)
  : path.resolve(process.cwd(), "var", "dev-mail-outbox");
const publicAppUrl = normalizeHttpUrl("PUBLIC_APP_URL", readOptionalString("PUBLIC_APP_URL"));
const trustedProxies = resolveTrustedProxies(readCommaSeparatedList("TRUSTED_PROXIES"));
const sharedRateLimitStore = resolveSharedRateLimitStoreConfig({
  provider: readOptionalString("SQR_RATE_LIMIT_STORE"),
  redisUrl: readOptionalString("SQR_REDIS_RATE_LIMIT_URL"),
});
const websocketSharedBus = resolveRuntimeWsSharedBusConfig({
  provider: readOptionalString("SQR_WS_SHARED_BUS"),
  redisUrl: readOptionalString("SQR_REDIS_WS_URL"),
  sharedRedisUrl: sharedRateLimitStore.redisUrl,
});
const configuredWebSocketMaxConnections = readInt(
  "SQR_WS_MAX_CONNECTIONS",
  DEFAULT_RUNTIME_WS_MAX_CONNECTIONS,
  { min: 1, max: 100_000 },
);
const configuredWebSocketMaxMessageBytes = readInt(
  "SQR_WS_MAX_MESSAGE_BYTES",
  DEFAULT_RUNTIME_WS_MAX_MESSAGE_BYTES,
  { min: 1024, max: 10 * 1024 * 1024 },
);
const databaseBootstrapMode = resolveDatabaseBootstrapMode(readOptionalString("SQR_DB_BOOTSTRAP_MODE"), {
  isProductionLike,
});
const allowRuntimeBootstrapInProduction = readBoolean(
  "SQR_ALLOW_RUNTIME_DB_BOOTSTRAP_IN_PRODUCTION",
  false,
);
const corsAllowedOrigins = resolveCorsAllowedOrigins({
  rawValue: readOptionalString("CORS_ALLOWED_ORIGINS"),
  publicAppUrl,
});
const configuredAuthCookieSecure = readOptionalString("AUTH_COOKIE_SECURE");
const cookieSecure = resolveCookieSecure(configuredAuthCookieSecure, {
  isProductionLike,
  publicAppUrl,
});
const cookieSameSite = resolveCookieSameSite(readOptionalString("SESSION_COOKIE_SAMESITE"));
const resolvedSessionSecret = readSecretOrThrow(
  "SESSION_SECRET",
  isProductionLike,
  () => buildEphemeralSecret("session"),
);
const resolvedAuditHmacKey = readOptionalString("SQR_AUDIT_HMAC_KEY") ?? resolvedSessionSecret;

assertRuntimeSessionSecretMinBytes(resolvedSessionSecret, { nodeEnv });

const resolvedDatabaseHost = readStringFrom(["PG_HOST", "PGHOST"], parsedDatabaseUrl?.host || "127.0.0.1");
const resolvedDatabasePort = readIntFrom(
  ["PG_PORT", "PGPORT"],
  parsedDatabaseUrl?.port || DEFAULT_POSTGRES_PORT,
  { min: MIN_COUNT, max: MAX_TCP_PORT },
);
const resolvedDatabaseUser = readStringFrom(["PG_USER", "PGUSER"], parsedDatabaseUrl?.user || "postgres");
const resolvedDatabasePassword = (() => {
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
})();
const resolvedDatabaseName = readStringFrom(
  ["PG_DATABASE", "PGDATABASE"],
  parsedDatabaseUrl?.database || "sqr_db",
);

assertPostgresRuntimeCredentialFormat({
  connectionString: configuredDatabaseUrl,
  database: resolvedDatabaseName,
  host: resolvedDatabaseHost,
  isProductionLike,
  password: resolvedDatabasePassword,
  user: resolvedDatabaseUser,
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
  operationsDebugRoutesEnabled,
});

assertRateLimiterMultiWorkerTopologySafety({
  configuredClusterMaxWorkers,
  distributedStoreConfigured: sharedRateLimitStore.distributedStoreConfigured,
});

assertProductionRateLimiterTopologySafety({
  isProductionLike,
  configuredClusterMaxWorkers,
  distributedStoreConfigured: sharedRateLimitStore.distributedStoreConfigured,
});

assertProductionReceiptExternalScanSafety({
  isProductionLike,
  externalScanEnabled: collectionReceiptExternalScanEnabled,
  externalScanFailClosed: collectionReceiptExternalScanFailClosed,
  externalScanCommand: collectionReceiptExternalScanCommand,
  externalScanArgsJson: collectionReceiptExternalScanArgsJson,
});

assertProductionTwoFactorReplayTopologySafety({
  isProductionLike,
  configuredClusterMaxWorkers,
  sharedReplayStoreConfigured: sharedRateLimitStore.distributedStoreConfigured,
});

assertProductionWebSocketRuntimeTopologySafety({
  isProductionLike,
  configuredClusterMaxWorkers,
  sharedBusConfigured: websocketSharedBus.distributedBusConfigured,
});

assertProductionDatabaseBootstrapModeSafety({
  isProductionLike,
  databaseBootstrapMode,
  allowRuntimeBootstrapInProduction,
});

assertNoPlaceholderSecrets({
  isProductionLike,
  configuredSessionSecret,
  configuredPreviousSessionSecrets,
  configuredPgPassword,
  configuredTwoFactorEncryptionKey,
  configuredPreviousTwoFactorEncryptionKeys,
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
    port: readInt("PORT", DEFAULT_HTTP_PORT, { min: MIN_COUNT, max: MAX_TCP_PORT }),
    host: readString("HOST", "0.0.0.0"),
    publicAppUrl,
    debugLogs,
    operationsDebugRoutesEnabled,
    operationsDebugAccessToken,
    operationsDebugAllowedIps: configuredOperationsDebugAllowedIps,
    logLevel,
    allowLocalDevCors: readBoolean("ALLOW_LOCAL_DEV_CORS", false),
    uploadsRootDir: resolveUploadsRootDir(),
    securityHeaders: {
      hsts: hstsHeaderConfig,
    },
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
    host: resolvedDatabaseHost,
    port: resolvedDatabasePort,
    user: resolvedDatabaseUser,
    password: resolvedDatabasePassword,
    database: resolvedDatabaseName,
    maxConnections: readInt("PG_MAX_CONNECTIONS", resolveDefaultPgMaxConnections(), { min: MIN_COUNT, max: 50 }),
    idleTimeoutMs: readInt("PG_IDLE_TIMEOUT_MS", 30_000, { min: MIN_TIMEOUT_MS }),
    connectionTimeoutMs: readInt("PG_CONNECTION_TIMEOUT_MS", 5_000, { min: MIN_TIMEOUT_MS }),
    statementTimeoutMs: readInt("PG_STATEMENT_TIMEOUT_MS", 30_000, {
      min: MIN_TIMEOUT_MS,
      max: 3_600_000,
    }),
    searchPath: readString("PG_SEARCH_PATH", "public"),
    ssl: databaseSslConfig,
  },
  auth: {
    sessionSecret: resolvedSessionSecret,
    previousSessionSecrets: configuredPreviousSessionSecrets,
    auditHmacKey: resolvedAuditHmacKey,
    bcryptCost: readInt("BCRYPT_COST_FACTOR", 12, { min: 12, max: 20 }),
    collectionNicknameTempPassword: readSecretOrThrow(
      "COLLECTION_NICKNAME_TEMP_PASSWORD",
      isProductionLike,
      () => buildEphemeralSecret("collection-temp").slice(0, 16),
    ),
    twoFactorAlgorithm: resolveTwoFactorTotpAlgorithm(configuredTwoFactorTotpAlgorithm),
    twoFactorEncryptionSecret: configuredTwoFactorEncryptionKey,
    seedDefaultUsers,
    cookieSecure,
    cookieSameSite,
  },
  ai: {
    host: readString("OLLAMA_HOST", "http://127.0.0.1:11434"),
    authToken: readOptionalString("OLLAMA_AUTH_TOKEN"),
    chatModel: readString("OLLAMA_CHAT_MODEL", "llama3:8b"),
    embedModel: readString("OLLAMA_EMBED_MODEL", "nomic-embed-text"),
    timeoutMs: readInt("OLLAMA_TIMEOUT_MS", 10_000, { min: MIN_TIMEOUT_MS }),
    precomputeOnStart: readBoolean("AI_PRECOMPUTE_ON_START", false),
    lowMemoryMode,
    debugLogs,
    debugEnabled: readBoolean("AI_DEBUG", false) && !isProductionLike,
    intentMode: readOptionalString("AI_INTENT_MODE"),
    gate: {
      globalLimit: readInt("AI_GATE_GLOBAL_LIMIT", 4, { min: MIN_COUNT }),
      queueLimit: readInt("AI_GATE_QUEUE_LIMIT", 20, { min: MIN_ZERO_COUNT }),
      queueWaitMs: readInt("AI_GATE_QUEUE_WAIT_MS", 12_000, { min: MIN_TIMEOUT_MS }),
      roleLimits: {
        user: readInt("AI_GATE_USER_LIMIT", 2, { min: MIN_COUNT }),
        admin: readInt("AI_GATE_ADMIN_LIMIT", 1, { min: MIN_COUNT }),
        superuser: readInt("AI_GATE_SUPERUSER_LIMIT", 1, { min: MIN_COUNT }),
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
  runtime: {
    defaults: {
      sessionTimeoutMinutes: readInt("DEFAULT_SESSION_TIMEOUT_MINUTES", 30, {
        min: MIN_SESSION_TIMEOUT_MINUTES,
        max: MAX_SESSION_TIMEOUT_MINUTES,
      }),
      wsIdleMinutes: readInt("DEFAULT_WS_IDLE_MINUTES", 3, { min: MIN_COUNT }),
      aiTimeoutMs: readInt("DEFAULT_AI_TIMEOUT_MS", 10_000, { min: MIN_TIMEOUT_MS }),
      searchResultLimit: readInt("DEFAULT_SEARCH_RESULT_LIMIT", 200, { min: 10, max: 5000 }),
      viewerRowsPerPage: readInt("DEFAULT_VIEWER_ROWS_PER_PAGE", 100, { min: 10, max: 500 }),
    },
    maintenanceCacheTtlMs: readInt("MAINTENANCE_CACHE_TTL_MS", 3_000, { min: 500 }),
    runtimeSettingsCacheTtlMs: readInt("RUNTIME_SETTINGS_CACHE_TTL_MS", 3_000, { min: 500 }),
    pgPoolWarnCooldownMs: readInt("PG_POOL_WARN_COOLDOWN_MS", 60_000, { min: MIN_TIMEOUT_MS }),
    redisHealthCheckIntervalMs: readInt("SQR_REDIS_HEALTH_CHECK_INTERVAL_MS", 60_000, { min: 5_000 }),
    gracefulShutdownTimeoutMs: readInt("GRACEFUL_SHUTDOWN_TIMEOUT_MS", 25_000, { min: 1_000 }),
    backupOperationTimeoutMs: readInt("BACKUP_OPERATION_TIMEOUT_MS", 120_000, { min: 5_000 }),
    backupMaxPayloadBytes: readInt(
      "BACKUP_MAX_PAYLOAD_BYTES",
      lowMemoryMode ? LOW_MEMORY_BACKUP_MAX_PAYLOAD_BYTES : STANDARD_BACKUP_MAX_PAYLOAD_BYTES,
      { min: ONE_MIB_BYTES, max: MAX_CONFIGURED_PAYLOAD_BYTES },
    ),
    importCsvMaxRows: readInt("IMPORT_CSV_MAX_ROWS", lowMemoryMode ? 100_000 : 250_000, {
      min: 1,
      max: 1_000_000,
    }),
    importInsertBatchSize: readInt("IMPORT_INSERT_BATCH_SIZE", 1_000, {
      min: 1,
      max: 5_000,
    }),
    importMaxRowBytes: readInt("IMPORT_MAX_ROW_BYTES", DEFAULT_IMPORT_MAX_ROW_BYTES, {
      min: ONE_KIB_BYTES,
      max: MAX_IMPORT_MAX_ROW_BYTES,
    }),
    importPerUserActiveUploadBytes: readInt(
      "IMPORT_PER_USER_ACTIVE_UPLOAD_BYTES",
      resolvedDefaultImportUploadLimitBytes,
      { min: ONE_MIB_BYTES, max: MAX_CONFIGURED_PAYLOAD_BYTES },
    ),
    importAnalysisTimeoutMs: readInt("IMPORT_ANALYSIS_TIMEOUT_MS", 45_000, { min: 5_000 }),
    collectionRollupListenReconnectMs: readInt("COLLECTION_ROLLUP_LISTEN_RECONNECT_MS", 5_000, { min: 1_000 }),
    httpRequestTimeoutMs: readInt("HTTP_REQUEST_TIMEOUT_MS", 115_000, { min: 1_000 }),
    httpSlowRequestMs: readInt("HTTP_SLOW_REQUEST_MS", 1_500, { min: 250 }),
    analyticsTimeZone: readString("ANALYTICS_TZ", "Asia/Kuala_Lumpur"),
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
      port: readInt("SMTP_PORT", DEFAULT_SMTP_PORT, { min: MIN_COUNT, max: MAX_TCP_PORT }),
      user: readOptionalString("SMTP_USER"),
      password: readOptionalString("SMTP_PASSWORD"),
      secure: readBoolean(
        "SMTP_SECURE",
        readInt("SMTP_PORT", DEFAULT_SMTP_PORT, { min: MIN_COUNT, max: MAX_TCP_PORT }) === SMTPS_PORT,
      ),
      requireTls: readBoolean("SMTP_REQUIRE_TLS", false),
    },
  },
  backups: {
    featureEnabled: backupFeatureEnabled,
    encryptionKey: configuredBackupEncryptionKey,
    encryptionKeys: configuredBackupEncryptionKeys,
    encryptionKeyId: readOptionalString("BACKUP_ENCRYPTION_KEY_ID"),
  },
  rateLimiting: {
    store: sharedRateLimitStore,
    userLimitsPerMinute: {
      reads: readInt("SQR_RATE_LIMIT_USER_READS_PER_MINUTE", 500, { min: 1, max: 100_000 }),
      uploads: readInt("SQR_RATE_LIMIT_USER_UPLOADS_PER_MINUTE", 10, { min: 1, max: 10_000 }),
      writes: readInt("SQR_RATE_LIMIT_USER_WRITES_PER_MINUTE", 100, { min: 1, max: 100_000 }),
    },
  },
  websocket: {
    maxConnections: configuredWebSocketMaxConnections,
    maxMessageBytes: configuredWebSocketMaxMessageBytes,
    sharedBus: websocketSharedBus,
  },
  cluster: {
    lowMemoryMode,
    maxWorkers: configuredClusterMaxWorkers,
    initialWorkers: readInt("SQR_INITIAL_WORKERS", 1, { min: 1 }),
    preallocateMb: readInt("SQR_PREALLOCATE_MB", lowMemoryMode ? 0 : 32, { min: 0 }),
    forceCluster: readBoolean("SQR_FORCE_CLUSTER", false),
  },
  bootstrap: {
    databaseMode: databaseBootstrapMode,
    localSuperuserCredentialsFileEnabled,
    users: {
      superuser: {
        username: readString("SEED_SUPERUSER_USERNAME", "superuser"),
        password: readString("SEED_SUPERUSER_PASSWORD", ""),
        fullName: readString("SEED_SUPERUSER_FULL_NAME", "Superuser"),
      },
      admin: {
        username: readString("SEED_ADMIN_USERNAME", "admin1"),
        password: readString("SEED_ADMIN_PASSWORD", ""),
        fullName: readString("SEED_ADMIN_FULL_NAME", "Admin"),
      },
      user: {
        username: readString("SEED_USER_USERNAME", "user1"),
        password: readString("SEED_USER_PASSWORD", ""),
        fullName: readString("SEED_USER_FULL_NAME", "User"),
      },
    },
    freshLocalSuperuser: {
      username: readString("SEED_SUPERUSER_USERNAME", "superuser"),
      password: readString("SEED_SUPERUSER_PASSWORD", ""),
      fullName: readString("SEED_SUPERUSER_FULL_NAME", "Local Superuser"),
    },
  },
});

const runtimeWarnings = buildRuntimeConfigWarnings({
  isStrictLocalDevelopment,
  isProductionLike,
  publicAppUrl,
  configuredSessionSecret,
  configuredCollectionNicknameTempPassword,
  configuredCollectionPiiEncryptionKey,
  configuredPgPassword,
  configuredAuthCookieSecure,
  configuredClusterMaxWorkers,
  twoFactorReplayStoreConfigured: sharedRateLimitStore.distributedStoreConfigured,
  websocketSharedBusConfigured: websocketSharedBus.distributedBusConfigured,
  hstsMaxAgeSeconds: hstsHeaderConfig.maxAge,
  hstsPreloadEnabled: hstsHeaderConfig.preload,
  mailConfiguration,
});

export const runtimeConfigValidation: RuntimeConfigValidationType = Object.freeze({
  warningCount: runtimeWarnings.length,
  warnings: Object.freeze(runtimeWarnings.map((warning) => Object.freeze({ ...warning }))),
});

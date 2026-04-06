import path from "node:path";
import {
  isProductionLikeEnvironment,
  isStrictLocalDevelopmentEnvironment,
} from "./runtime-environment";
import { DEFAULT_IMPORT_BODY_LIMIT } from "./body-limit";
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
  resolveCookieSecure,
  resolveCorsAllowedOrigins,
  resolvePreviousSessionSecrets,
  resolveTrustedProxies,
} from "./runtime-config-safety-utils";
import type {
  RuntimeConfig,
  RuntimeConfigValidation as RuntimeConfigValidationType,
} from "./runtime-config-types";

export type { RuntimeConfigDiagnostic, RuntimeConfigValidation } from "./runtime-config-types";

const nodeEnv = resolveNodeEnv();
const isProduction = nodeEnv === "production";
const isStrictLocalDevelopment = isStrictLocalDevelopmentEnvironment();
const isProductionLike = isProductionLikeEnvironment();
const debugLogs = readBoolean("DEBUG_LOGS", false);
const lowMemoryMode = readBoolean("SQR_LOW_MEMORY_MODE", true);
const seedDefaultUsers = readBoolean("SEED_DEFAULT_USERS", false);
const backupFeatureEnabled = readBoolean("BACKUP_FEATURE_ENABLED", true);
const localSuperuserCredentialsFileEnabled = readBoolean("LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED", false);
const mailDevOutboxEnabled = readBoolean("MAIL_DEV_OUTBOX_ENABLED", false);

const configuredSessionSecret = readOptionalString("SESSION_SECRET");
const configuredPreviousSessionSecrets = resolvePreviousSessionSecrets(
  readCommaSeparatedList("SESSION_SECRET_PREVIOUS"),
  configuredSessionSecret,
);
const configuredCollectionNicknameTempPassword = readOptionalString("COLLECTION_NICKNAME_TEMP_PASSWORD");
const configuredPgPassword = readOptionalString("PG_PASSWORD");
const configuredBackupEncryptionKey = readOptionalString("BACKUP_ENCRYPTION_KEY");
const configuredBackupEncryptionKeys = readOptionalString("BACKUP_ENCRYPTION_KEYS");
const publicAppUrl = normalizeHttpUrl("PUBLIC_APP_URL", readOptionalString("PUBLIC_APP_URL"));
const trustedProxies = resolveTrustedProxies(readCommaSeparatedList("TRUSTED_PROXIES"));
const corsAllowedOrigins = resolveCorsAllowedOrigins({
  rawValue: readOptionalString("CORS_ALLOWED_ORIGINS"),
  publicAppUrl,
});
const cookieSecure = resolveCookieSecure(readOptionalString("AUTH_COOKIE_SECURE"), {
  isProduction,
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
  seedDefaultUsers,
  localSuperuserCredentialsFileEnabled,
  mailDevOutboxEnabled,
});

assertNoPlaceholderSecrets({
  isProductionLike,
  configuredSessionSecret,
  configuredPreviousSessionSecrets,
  configuredPgPassword,
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
    uploadsRootDir: path.resolve(process.cwd(), "uploads"),
    bodyLimits: {
      default: readString("DEFAULT_BODY_LIMIT", "2mb"),
      imports: readString("IMPORT_BODY_LIMIT", DEFAULT_IMPORT_BODY_LIMIT),
      collection: readString("COLLECTION_BODY_LIMIT", "8mb"),
    },
    corsAllowedOrigins,
    trustedProxies,
  },
  database: {
    host: readString("PG_HOST", "localhost"),
    port: readInt("PG_PORT", 5432, { min: 1, max: 65535 }),
    user: readString("PG_USER", "postgres"),
    password: (() => {
      if (configuredPgPassword) {
        return configuredPgPassword;
      }
      if (isProductionLike) {
        throw new Error("PG_PASSWORD is required outside strict local development.");
      }
      // Keep the local-development path passwordless-friendly while ensuring pg
      // always receives a string and can surface a normal auth failure instead
      // of throwing on undefined during SCRAM negotiation.
      return "";
    })(),
    database: readString("PG_DATABASE", "sqr_db"),
    maxConnections: readInt("PG_MAX_CONNECTIONS", 5, { min: 1, max: 50 }),
    idleTimeoutMs: readInt("PG_IDLE_TIMEOUT_MS", 30_000, { min: 1_000 }),
    connectionTimeoutMs: readInt("PG_CONNECTION_TIMEOUT_MS", 5_000, { min: 1_000 }),
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
    seedDefaultUsers,
    cookieSecure,
  },
  ai: {
    host: readString("OLLAMA_HOST", "http://127.0.0.1:11434"),
    chatModel: readString("OLLAMA_CHAT_MODEL", "llama3:8b"),
    embedModel: readString("OLLAMA_EMBED_MODEL", "nomic-embed-text"),
    timeoutMs: readInt("OLLAMA_TIMEOUT_MS", 6_000, { min: 1_000 }),
    precomputeOnStart: readBoolean("AI_PRECOMPUTE_ON_START", false),
    lowMemoryMode,
    debugLogs,
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
    backupOperationTimeoutMs: readInt("BACKUP_OPERATION_TIMEOUT_MS", 120_000, { min: 5_000 }),
    importAnalysisTimeoutMs: readInt("IMPORT_ANALYSIS_TIMEOUT_MS", 45_000, { min: 5_000 }),
    collectionRollupListenReconnectMs: readInt("COLLECTION_ROLLUP_LISTEN_RECONNECT_MS", 5_000, { min: 1_000 }),
  },
  cluster: {
    lowMemoryMode,
    maxWorkers: readInt("SQR_MAX_WORKERS", lowMemoryMode ? 1 : 4, { min: 1 }),
    initialWorkers: readInt("SQR_INITIAL_WORKERS", 1, { min: 1 }),
    preallocateMb: readInt("SQR_PREALLOCATE_MB", lowMemoryMode ? 0 : 32, { min: 0 }),
  },
});

const runtimeWarnings = buildRuntimeConfigWarnings({
  isStrictLocalDevelopment,
  publicAppUrl,
  configuredSessionSecret,
  configuredCollectionNicknameTempPassword,
  configuredPgPassword,
  mailConfiguration,
});

export const runtimeConfigValidation: RuntimeConfigValidationType = Object.freeze({
  warningCount: runtimeWarnings.length,
  warnings: Object.freeze(runtimeWarnings.map((warning) => Object.freeze({ ...warning }))),
});

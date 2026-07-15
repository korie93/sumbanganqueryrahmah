import { z } from "zod";
import {
  COLLECTION_PII_RETIRED_FIELD_LIST_LABEL,
  isAllowedCollectionPiiRetiredField,
} from "./collection-pii-field-config";

type RuntimeEnvironmentSource = Record<string, string | undefined>;

const DEFAULT_STRING_MAX_LENGTH = 4_096;
const SECRET_STRING_MAX_LENGTH = 8_192;
const AUDIT_HMAC_KEY_MIN_LENGTH = 32;
const BOOLEAN_ENV_VALUES = new Set(["1", "0", "true", "false", "yes", "no", "on", "off"]);
const AUTH_COOKIE_SECURE_VALUES = new Set(["auto", "true", "false", "1", "0"]);
const SESSION_COOKIE_SAMESITE_VALUES = new Set(["strict", "lax"]);
const DB_BOOTSTRAP_MODE_VALUES = new Set(["runtime", "migration"]);
const RATE_LIMIT_STORE_VALUES = new Set(["memory", "redis"]);
const WS_SHARED_BUS_VALUES = new Set(["memory", "redis"]);
const TWO_FACTOR_TOTP_ALGORITHM_VALUES = new Set(["sha1", "sha256"]);
export const MIN_SESSION_TIMEOUT_MINUTES = 1;
export const MAX_SESSION_TIMEOUT_MINUTES = 24 * 60;

function normalizeOptionalEnvString(value: unknown) {
  if (value == null) {
    return undefined;
  }
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function optionalEnvString(name: string, maxLength = DEFAULT_STRING_MAX_LENGTH) {
  return z.preprocess(
    normalizeOptionalEnvString,
    z
      .string({ invalid_type_error: `${name} must be a string.` })
      .max(maxLength, `${name} must be ${maxLength} characters or fewer.`)
      .optional(),
  );
}

function optionalIsoTimestampEnv(name: string) {
  return z.preprocess(
    normalizeOptionalEnvString,
    z
      .string({ invalid_type_error: `${name} must be an ISO 8601 timestamp.` })
      .datetime({
        offset: true,
        message: `${name} must be an ISO 8601 timestamp with a timezone.`,
      })
      .optional(),
  );
}

function optionalBooleanEnv(name: string) {
  return z.preprocess(
    normalizeOptionalEnvString,
    z
      .string({ invalid_type_error: `${name} must be a boolean flag.` })
      .transform((value) => value.toLowerCase())
      .refine(
        (value) => BOOLEAN_ENV_VALUES.has(value),
        `${name} must be a boolean flag (1/0, true/false, yes/no, on/off).`,
      )
      .optional(),
  );
}

function optionalAuthCookieSecureEnv() {
  return z.preprocess(
    normalizeOptionalEnvString,
    z
      .string({ invalid_type_error: "AUTH_COOKIE_SECURE must be a string." })
      .transform((value) => value.toLowerCase())
      .refine(
        (value) => AUTH_COOKIE_SECURE_VALUES.has(value),
        "AUTH_COOKIE_SECURE must be one of: auto, true, false, 1, or 0.",
      )
      .optional(),
  );
}

function optionalSessionCookieSameSiteEnv() {
  return z.preprocess(
    normalizeOptionalEnvString,
    z
      .string({ invalid_type_error: "SESSION_COOKIE_SAMESITE must be a string." })
      .transform((value) => value.toLowerCase())
      .refine(
        (value) => SESSION_COOKIE_SAMESITE_VALUES.has(value),
        "SESSION_COOKIE_SAMESITE must be one of: strict or lax.",
      )
      .optional(),
  );
}

function optionalMinLengthEnvString(
  name: string,
  minLength: number,
  maxLength = DEFAULT_STRING_MAX_LENGTH,
) {
  return optionalEnvString(name, maxLength).refine(
    (value) => value === undefined || value.length >= minLength,
    `${name} must be at least ${minLength} characters when set.`,
  );
}

function optionalDbBootstrapModeEnv() {
  return z.preprocess(
    normalizeOptionalEnvString,
    z
      .string({ invalid_type_error: "SQR_DB_BOOTSTRAP_MODE must be a string." })
      .transform((value) => value.toLowerCase())
      .refine(
        (value) => DB_BOOTSTRAP_MODE_VALUES.has(value),
        "SQR_DB_BOOTSTRAP_MODE must be one of: runtime or migration.",
      )
      .optional(),
  );
}

function optionalRateLimitStoreEnv() {
  return z.preprocess(
    normalizeOptionalEnvString,
    z
      .string({ invalid_type_error: "SQR_RATE_LIMIT_STORE must be a string." })
      .transform((value) => value.toLowerCase())
      .refine(
        (value) => RATE_LIMIT_STORE_VALUES.has(value),
        "SQR_RATE_LIMIT_STORE must be one of: memory or redis.",
      )
      .optional(),
  );
}

function optionalWsSharedBusEnv() {
  return z.preprocess(
    normalizeOptionalEnvString,
    z
      .string({ invalid_type_error: "SQR_WS_SHARED_BUS must be a string." })
      .transform((value) => value.toLowerCase())
      .refine(
        (value) => WS_SHARED_BUS_VALUES.has(value),
        "SQR_WS_SHARED_BUS must be one of: memory or redis.",
      )
      .optional(),
  );
}

function optionalTwoFactorTotpAlgorithmEnv() {
  return z.preprocess(
    normalizeOptionalEnvString,
    z
      .string({ invalid_type_error: "TWO_FACTOR_TOTP_ALGORITHM must be a string." })
      .transform((value) => value.toLowerCase())
      .refine(
        (value) => TWO_FACTOR_TOTP_ALGORITHM_VALUES.has(value),
        "TWO_FACTOR_TOTP_ALGORITHM must be one of: SHA1 or SHA256.",
      )
      .optional(),
  );
}

function optionalIntEnv(name: string, options: { min?: number; max?: number } = {}) {
  return z.preprocess(
    normalizeOptionalEnvString,
    z
      .string({ invalid_type_error: `${name} must be an integer.` })
      .regex(/^-?\d+$/, `${name} must be an integer.`)
      .transform((value) => Number.parseInt(value, 10))
      .refine(
        (value) => Number.isSafeInteger(value),
        `${name} must be a safe integer.`,
      )
      .refine(
        (value) => options.min == null || value >= options.min,
        `${name} must be at least ${options.min}.`,
      )
      .refine(
        (value) => options.max == null || value <= options.max,
        `${name} must be at most ${options.max}.`,
      )
      .optional(),
  );
}

function optionalCollectionPiiRetiredFieldsEnv(name: string) {
  return z.preprocess(
    normalizeOptionalEnvString,
    z
      .string({ invalid_type_error: `${name} must be a comma-separated string.` })
      .refine((value) => {
        const fields = value
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean);
        return fields.every(isAllowedCollectionPiiRetiredField);
      }, `${name} must contain only: ${COLLECTION_PII_RETIRED_FIELD_LIST_LABEL}.`)
      .optional(),
  );
}

const runtimeEnvironmentShape = {
  NODE_ENV: optionalEnvString("NODE_ENV", 64),
  DEBUG_LOGS: optionalBooleanEnv("DEBUG_LOGS"),
  OPERATIONS_DEBUG_ROUTES_ENABLED: optionalBooleanEnv("OPERATIONS_DEBUG_ROUTES_ENABLED"),
  OPERATIONS_DEBUG_ACCESS_TOKEN: optionalEnvString("OPERATIONS_DEBUG_ACCESS_TOKEN", SECRET_STRING_MAX_LENGTH),
  OPERATIONS_DEBUG_ALLOWED_IPS: optionalEnvString("OPERATIONS_DEBUG_ALLOWED_IPS", 1_024),
  LOG_LEVEL: optionalEnvString("LOG_LEVEL", 64),
  HOST: optionalEnvString("HOST", 255),
  PORT: optionalIntEnv("PORT", { min: 1, max: 65_535 }),
  PUBLIC_APP_URL: optionalEnvString("PUBLIC_APP_URL"),
  DEFAULT_BODY_LIMIT: optionalEnvString("DEFAULT_BODY_LIMIT", 64),
  IMPORT_BODY_LIMIT: optionalEnvString("IMPORT_BODY_LIMIT", 64),
  IMPORT_MAX_FILE_SIZE_MB: optionalIntEnv("IMPORT_MAX_FILE_SIZE_MB", { min: 1, max: 512 }),
  IMPORT_CSV_MAX_ROWS: optionalIntEnv("IMPORT_CSV_MAX_ROWS", {
    min: 1,
    max: 1_000_000,
  }),
  IMPORT_MAX_COLUMNS: optionalIntEnv("IMPORT_MAX_COLUMNS", { min: 1, max: 5_000 }),
  IMPORT_MAX_SHEETS: optionalIntEnv("IMPORT_MAX_SHEETS", { min: 1, max: 100 }),
  IMPORT_MAX_CELL_LENGTH: optionalIntEnv("IMPORT_MAX_CELL_LENGTH", {
    min: 1,
    max: 1_000_000,
  }),
  IMPORT_INSERT_BATCH_SIZE: optionalIntEnv("IMPORT_INSERT_BATCH_SIZE", { min: 1, max: 5_000 }),
  IMPORT_MAX_ROW_BYTES: optionalIntEnv("IMPORT_MAX_ROW_BYTES", { min: 1_024, max: 1024 * 1024 }),
  IMPORT_PER_USER_ACTIVE_UPLOAD_BYTES: optionalIntEnv("IMPORT_PER_USER_ACTIVE_UPLOAD_BYTES", {
    min: 1_048_576,
    max: 536_870_912,
  }),
  IMPORT_BACKGROUND_THRESHOLD_BYTES: optionalIntEnv("IMPORT_BACKGROUND_THRESHOLD_BYTES", {
    min: 1_048_576,
    max: 536_870_912,
  }),
  COLLECTION_BODY_LIMIT: optionalEnvString("COLLECTION_BODY_LIMIT", 64),
  CORS_ALLOWED_ORIGINS: optionalEnvString("CORS_ALLOWED_ORIGINS"),
  TRUSTED_PROXIES: optionalEnvString("TRUSTED_PROXIES"),
  ALLOW_LOCAL_DEV_CORS: optionalBooleanEnv("ALLOW_LOCAL_DEV_CORS"),
  HTTP_SLOW_REQUEST_MS: optionalIntEnv("HTTP_SLOW_REQUEST_MS", { min: 250 }),
  HTTP_REQUEST_TIMEOUT_MS: optionalIntEnv("HTTP_REQUEST_TIMEOUT_MS", { min: 1_000 }),
  HSTS_MAX_AGE_SECONDS: optionalIntEnv("HSTS_MAX_AGE_SECONDS", {
    min: 0,
    max: 63_072_000,
  }),
  HSTS_PRELOAD_ENABLED: optionalBooleanEnv("HSTS_PRELOAD_ENABLED"),
  SQR_RATE_LIMIT_STORE: optionalRateLimitStoreEnv(),
  SQR_REDIS_RATE_LIMIT_URL: optionalEnvString("SQR_REDIS_RATE_LIMIT_URL", SECRET_STRING_MAX_LENGTH),
  SQR_QUEUE_REDIS_URL: optionalEnvString("SQR_QUEUE_REDIS_URL", SECRET_STRING_MAX_LENGTH),
  SQR_REDIS_HEALTH_CHECK_INTERVAL_MS: optionalIntEnv("SQR_REDIS_HEALTH_CHECK_INTERVAL_MS", { min: 5_000 }),
  SQR_RATE_LIMIT_USER_READS_PER_MINUTE: optionalIntEnv(
    "SQR_RATE_LIMIT_USER_READS_PER_MINUTE",
    { min: 1, max: 100_000 },
  ),
  SQR_RATE_LIMIT_USER_WRITES_PER_MINUTE: optionalIntEnv(
    "SQR_RATE_LIMIT_USER_WRITES_PER_MINUTE",
    { min: 1, max: 100_000 },
  ),
  SQR_RATE_LIMIT_USER_UPLOADS_PER_MINUTE: optionalIntEnv(
    "SQR_RATE_LIMIT_USER_UPLOADS_PER_MINUTE",
    { min: 1, max: 10_000 },
  ),
  SQR_WS_SHARED_BUS: optionalWsSharedBusEnv(),
  SQR_REDIS_WS_URL: optionalEnvString("SQR_REDIS_WS_URL", SECRET_STRING_MAX_LENGTH),
  SQR_WS_MAX_CONNECTIONS: optionalIntEnv("SQR_WS_MAX_CONNECTIONS", { min: 1, max: 100_000 }),
  SQR_WS_MAX_MESSAGE_BYTES: optionalIntEnv("SQR_WS_MAX_MESSAGE_BYTES", { min: 1024, max: 64 * 1024 }),

  DATABASE_URL: optionalEnvString("DATABASE_URL", SECRET_STRING_MAX_LENGTH),
  DATABASE_REPLICA_URL: optionalEnvString("DATABASE_REPLICA_URL", SECRET_STRING_MAX_LENGTH),
  DATABASE_SSL: optionalBooleanEnv("DATABASE_SSL"),
  DATABASE_SSL_CA: optionalEnvString("DATABASE_SSL_CA", SECRET_STRING_MAX_LENGTH),
  DATABASE_SSL_CA_FILE: optionalEnvString("DATABASE_SSL_CA_FILE", 1_024),
  PG_HOST: optionalEnvString("PG_HOST", 255),
  PGHOST: optionalEnvString("PGHOST", 255),
  PG_PORT: optionalIntEnv("PG_PORT", { min: 1, max: 65_535 }),
  PGPORT: optionalIntEnv("PGPORT", { min: 1, max: 65_535 }),
  PG_USER: optionalEnvString("PG_USER", 255),
  PGUSER: optionalEnvString("PGUSER", 255),
  PG_PASSWORD: optionalEnvString("PG_PASSWORD", SECRET_STRING_MAX_LENGTH),
  PGPASSWORD: optionalEnvString("PGPASSWORD", SECRET_STRING_MAX_LENGTH),
  PG_DATABASE: optionalEnvString("PG_DATABASE", 255),
  PGDATABASE: optionalEnvString("PGDATABASE", 255),
  PG_MAX_CONNECTIONS: optionalIntEnv("PG_MAX_CONNECTIONS", { min: 1, max: 50 }),
  PG_IDLE_TIMEOUT_MS: optionalIntEnv("PG_IDLE_TIMEOUT_MS", { min: 1_000 }),
  PG_CONNECTION_TIMEOUT_MS: optionalIntEnv("PG_CONNECTION_TIMEOUT_MS", { min: 1_000 }),
  PG_STATEMENT_TIMEOUT_MS: optionalIntEnv("PG_STATEMENT_TIMEOUT_MS", { min: 1_000, max: 3_600_000 }),
  PG_SEARCH_PATH: optionalEnvString("PG_SEARCH_PATH", 255),
  SQR_DB_BOOTSTRAP_MODE: optionalDbBootstrapModeEnv(),
  SQR_ALLOW_RUNTIME_DB_BOOTSTRAP_IN_PRODUCTION: optionalBooleanEnv(
    "SQR_ALLOW_RUNTIME_DB_BOOTSTRAP_IN_PRODUCTION",
  ),

  SESSION_SECRET: optionalEnvString("SESSION_SECRET", SECRET_STRING_MAX_LENGTH),
  SESSION_SECRET_PREVIOUS: optionalEnvString("SESSION_SECRET_PREVIOUS", SECRET_STRING_MAX_LENGTH),
  SESSION_JWT_PRIVATE_KEY: optionalEnvString("SESSION_JWT_PRIVATE_KEY", SECRET_STRING_MAX_LENGTH),
  SESSION_JWT_PUBLIC_KEY: optionalEnvString("SESSION_JWT_PUBLIC_KEY", SECRET_STRING_MAX_LENGTH),
  SESSION_JWT_LEGACY_HS256_VERIFY_UNTIL: optionalIsoTimestampEnv(
    "SESSION_JWT_LEGACY_HS256_VERIFY_UNTIL",
  ),
  BCRYPT_COST_FACTOR: optionalIntEnv("BCRYPT_COST_FACTOR", { min: 12, max: 20 }),
  SQR_AUDIT_HMAC_KEY: optionalMinLengthEnvString(
    "SQR_AUDIT_HMAC_KEY",
    AUDIT_HMAC_KEY_MIN_LENGTH,
    SECRET_STRING_MAX_LENGTH,
  ),
  TWO_FACTOR_ENCRYPTION_KEY: optionalEnvString("TWO_FACTOR_ENCRYPTION_KEY", SECRET_STRING_MAX_LENGTH),
  TWO_FACTOR_ENCRYPTION_KEY_PREVIOUS: optionalEnvString(
    "TWO_FACTOR_ENCRYPTION_KEY_PREVIOUS",
    SECRET_STRING_MAX_LENGTH,
  ),
  TWO_FACTOR_TOTP_ALGORITHM: optionalTwoFactorTotpAlgorithmEnv(),
  COLLECTION_PII_ENCRYPTION_KEY: optionalEnvString("COLLECTION_PII_ENCRYPTION_KEY", SECRET_STRING_MAX_LENGTH),
  COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS: optionalEnvString(
    "COLLECTION_PII_ENCRYPTION_KEY_PREVIOUS",
    SECRET_STRING_MAX_LENGTH,
  ),
  COLLECTION_PII_RETIRED_FIELDS: optionalCollectionPiiRetiredFieldsEnv(
    "COLLECTION_PII_RETIRED_FIELDS",
  ),
  COLLECTION_RECEIPT_QUARANTINE_ENABLED: optionalBooleanEnv(
    "COLLECTION_RECEIPT_QUARANTINE_ENABLED",
  ),
  COLLECTION_RECEIPT_QUARANTINE_DIR: optionalEnvString(
    "COLLECTION_RECEIPT_QUARANTINE_DIR",
  ),
  COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED: optionalBooleanEnv(
    "COLLECTION_RECEIPT_EXTERNAL_SCAN_ENABLED",
  ),
  COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND: optionalEnvString(
    "COLLECTION_RECEIPT_EXTERNAL_SCAN_COMMAND",
    512,
  ),
  COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON: optionalEnvString(
    "COLLECTION_RECEIPT_EXTERNAL_SCAN_ARGS_JSON",
    4_096,
  ),
  COLLECTION_RECEIPT_EXTERNAL_SCAN_TIMEOUT_MS: optionalIntEnv(
    "COLLECTION_RECEIPT_EXTERNAL_SCAN_TIMEOUT_MS",
    { min: 1_000, max: 600_000 },
  ),
  SQR_SCANNER_TIMEOUT_MS: optionalIntEnv("SQR_SCANNER_TIMEOUT_MS", { min: 1_000, max: 600_000 }),
  COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED: optionalBooleanEnv(
    "COLLECTION_RECEIPT_EXTERNAL_SCAN_FAIL_CLOSED",
  ),
  COLLECTION_RECEIPT_EXTERNAL_SCAN_CLEAN_EXIT_CODES: optionalEnvString(
    "COLLECTION_RECEIPT_EXTERNAL_SCAN_CLEAN_EXIT_CODES",
    255,
  ),
  COLLECTION_RECEIPT_EXTERNAL_SCAN_REJECT_EXIT_CODES: optionalEnvString(
    "COLLECTION_RECEIPT_EXTERNAL_SCAN_REJECT_EXIT_CODES",
    255,
  ),
  COLLECTION_NICKNAME_TEMP_PASSWORD: optionalEnvString(
    "COLLECTION_NICKNAME_TEMP_PASSWORD",
    SECRET_STRING_MAX_LENGTH,
  ),
  AUTH_COOKIE_SECURE: optionalAuthCookieSecureEnv(),
  SESSION_COOKIE_SAMESITE: optionalSessionCookieSameSiteEnv(),
  SEED_DEFAULT_USERS: optionalBooleanEnv("SEED_DEFAULT_USERS"),
  LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: optionalBooleanEnv(
    "LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED",
  ),
  SEED_SUPERUSER_USERNAME: optionalEnvString("SEED_SUPERUSER_USERNAME", 255),
  SEED_SUPERUSER_PASSWORD: optionalEnvString("SEED_SUPERUSER_PASSWORD", SECRET_STRING_MAX_LENGTH),
  SEED_SUPERUSER_FULL_NAME: optionalEnvString("SEED_SUPERUSER_FULL_NAME", 255),
  SEED_ADMIN_USERNAME: optionalEnvString("SEED_ADMIN_USERNAME", 255),
  SEED_ADMIN_PASSWORD: optionalEnvString("SEED_ADMIN_PASSWORD", SECRET_STRING_MAX_LENGTH),
  SEED_ADMIN_FULL_NAME: optionalEnvString("SEED_ADMIN_FULL_NAME", 255),
  SEED_USER_USERNAME: optionalEnvString("SEED_USER_USERNAME", 255),
  SEED_USER_PASSWORD: optionalEnvString("SEED_USER_PASSWORD", SECRET_STRING_MAX_LENGTH),
  SEED_USER_FULL_NAME: optionalEnvString("SEED_USER_FULL_NAME", 255),
  MAIL_DEV_OUTBOX_ENABLED: optionalBooleanEnv("MAIL_DEV_OUTBOX_ENABLED"),
  MAIL_DEV_OUTBOX_DIR: optionalEnvString("MAIL_DEV_OUTBOX_DIR"),
  MAIL_DEV_OUTBOX_MAX_FILES: optionalIntEnv("MAIL_DEV_OUTBOX_MAX_FILES", {
    min: 1,
    max: 10_000,
  }),

  BACKUP_ENCRYPTION_KEY: optionalEnvString("BACKUP_ENCRYPTION_KEY", SECRET_STRING_MAX_LENGTH),
  BACKUP_ENCRYPTION_KEYS: optionalEnvString("BACKUP_ENCRYPTION_KEYS", SECRET_STRING_MAX_LENGTH),
  BACKUP_ENCRYPTION_KEY_ID: optionalEnvString("BACKUP_ENCRYPTION_KEY_ID", 64),
  BACKUP_ALLOW_LEGACY_UNENCRYPTED_READ: optionalBooleanEnv(
    "BACKUP_ALLOW_LEGACY_UNENCRYPTED_READ",
  ),
  BACKUP_FEATURE_ENABLED: optionalBooleanEnv("BACKUP_FEATURE_ENABLED"),
  BACKUP_MAX_PAYLOAD_BYTES: optionalIntEnv("BACKUP_MAX_PAYLOAD_BYTES", {
    min: 1_048_576,
    max: 536_870_912,
  }),
  RESTORE_CHUNK_SIZE: optionalIntEnv("RESTORE_CHUNK_SIZE", { min: 1, max: 5_000 }),

  SMTP_SERVICE: optionalEnvString("SMTP_SERVICE", 255),
  SMTP_HOST: optionalEnvString("SMTP_HOST", 255),
  SMTP_PORT: optionalIntEnv("SMTP_PORT", { min: 1, max: 65_535 }),
  SMTP_USER: optionalEnvString("SMTP_USER", 255),
  SMTP_PASSWORD: optionalEnvString("SMTP_PASSWORD", SECRET_STRING_MAX_LENGTH),
  SMTP_SECURE: optionalBooleanEnv("SMTP_SECURE"),
  SMTP_REQUIRE_TLS: optionalBooleanEnv("SMTP_REQUIRE_TLS"),
  MAIL_FROM: optionalEnvString("MAIL_FROM", 255),

  OLLAMA_HOST: optionalEnvString("OLLAMA_HOST"),
  OLLAMA_AUTH_TOKEN: optionalEnvString("OLLAMA_AUTH_TOKEN", SECRET_STRING_MAX_LENGTH),
  OLLAMA_ALLOW_REMOTE: optionalBooleanEnv("OLLAMA_ALLOW_REMOTE"),
  OLLAMA_CHAT_MODEL: optionalEnvString("OLLAMA_CHAT_MODEL", 255),
  OLLAMA_EMBED_MODEL: optionalEnvString("OLLAMA_EMBED_MODEL", 255),
  OLLAMA_TIMEOUT_MS: optionalIntEnv("OLLAMA_TIMEOUT_MS", { min: 1_000 }),
  AI_PRECOMPUTE_ON_START: optionalBooleanEnv("AI_PRECOMPUTE_ON_START"),
  AI_DEBUG: optionalBooleanEnv("AI_DEBUG"),
  AI_INTENT_MODE: optionalEnvString("AI_INTENT_MODE", 64),
  AI_GATE_GLOBAL_LIMIT: optionalIntEnv("AI_GATE_GLOBAL_LIMIT", { min: 1 }),
  AI_GATE_QUEUE_LIMIT: optionalIntEnv("AI_GATE_QUEUE_LIMIT", { min: 0 }),
  AI_GATE_QUEUE_WAIT_MS: optionalIntEnv("AI_GATE_QUEUE_WAIT_MS", { min: 1_000 }),
  AI_GATE_USER_LIMIT: optionalIntEnv("AI_GATE_USER_LIMIT", { min: 1 }),
  AI_GATE_ADMIN_LIMIT: optionalIntEnv("AI_GATE_ADMIN_LIMIT", { min: 1 }),
  AI_GATE_MANAGER_LIMIT: optionalIntEnv("AI_GATE_MANAGER_LIMIT", { min: 1 }),
  AI_GATE_SUPERUSER_LIMIT: optionalIntEnv("AI_GATE_SUPERUSER_LIMIT", { min: 1 }),
  AI_LATENCY_STALE_AFTER_MS: optionalIntEnv("AI_LATENCY_STALE_AFTER_MS", { min: 5_000 }),
  AI_LATENCY_DECAY_HALF_LIFE_MS: optionalIntEnv("AI_LATENCY_DECAY_HALF_LIFE_MS", { min: 5_000 }),
  SQR_MAX_SEARCH_CACHE_ENTRIES: optionalIntEnv("SQR_MAX_SEARCH_CACHE_ENTRIES", { min: 10 }),
  SQR_MAX_AI_LAST_PERSON_ENTRIES: optionalIntEnv("SQR_MAX_AI_LAST_PERSON_ENTRIES", { min: 10 }),
  SQR_AI_LAST_PERSON_TTL_MS: optionalIntEnv("SQR_AI_LAST_PERSON_TTL_MS", { min: 60_000 }),
  SQR_LOW_MEMORY_MODE: optionalBooleanEnv("SQR_LOW_MEMORY_MODE"),

  DEFAULT_SESSION_TIMEOUT_MINUTES: optionalIntEnv("DEFAULT_SESSION_TIMEOUT_MINUTES", {
    min: MIN_SESSION_TIMEOUT_MINUTES,
    max: MAX_SESSION_TIMEOUT_MINUTES,
  }),
  DEFAULT_WS_IDLE_MINUTES: optionalIntEnv("DEFAULT_WS_IDLE_MINUTES", { min: 1 }),
  DEFAULT_AI_TIMEOUT_MS: optionalIntEnv("DEFAULT_AI_TIMEOUT_MS", { min: 1_000 }),
  DEFAULT_SEARCH_RESULT_LIMIT: optionalIntEnv("DEFAULT_SEARCH_RESULT_LIMIT", { min: 10, max: 5_000 }),
  DEFAULT_VIEWER_ROWS_PER_PAGE: optionalIntEnv("DEFAULT_VIEWER_ROWS_PER_PAGE", { min: 10, max: 500 }),
  MAINTENANCE_CACHE_TTL_MS: optionalIntEnv("MAINTENANCE_CACHE_TTL_MS", { min: 500 }),
  RUNTIME_SETTINGS_CACHE_TTL_MS: optionalIntEnv("RUNTIME_SETTINGS_CACHE_TTL_MS", { min: 500 }),
  PG_POOL_WARN_COOLDOWN_MS: optionalIntEnv("PG_POOL_WARN_COOLDOWN_MS", { min: 1_000 }),
  GRACEFUL_SHUTDOWN_TIMEOUT_MS: optionalIntEnv("GRACEFUL_SHUTDOWN_TIMEOUT_MS", { min: 1_000 }),
  COLLECTION_ROUTE_WARN_MS: optionalIntEnv("COLLECTION_ROUTE_WARN_MS", { min: 250 }),
  SQR_MAX_EVENT_LISTENERS: optionalIntEnv("SQR_MAX_EVENT_LISTENERS", { min: 16, max: 1_024 }),
  ANALYTICS_TZ: optionalEnvString("ANALYTICS_TZ", 255),
  BACKUP_OPERATION_TIMEOUT_MS: optionalIntEnv("BACKUP_OPERATION_TIMEOUT_MS", { min: 5_000 }),
  IMPORT_ANALYSIS_TIMEOUT_MS: optionalIntEnv("IMPORT_ANALYSIS_TIMEOUT_MS", { min: 5_000 }),
  COLLECTION_ROLLUP_LISTEN_RECONNECT_MS: optionalIntEnv(
    "COLLECTION_ROLLUP_LISTEN_RECONNECT_MS",
    { min: 1_000 },
  ),

  SQR_FORCE_CLUSTER: optionalBooleanEnv("SQR_FORCE_CLUSTER"),
  SQR_MAX_WORKERS: optionalIntEnv("SQR_MAX_WORKERS", { min: 1 }),
  SQR_INITIAL_WORKERS: optionalIntEnv("SQR_INITIAL_WORKERS", { min: 1 }),
  SQR_PREALLOCATE_MB: optionalIntEnv("SQR_PREALLOCATE_MB", { min: 0 }),
} satisfies z.ZodRawShape;

const runtimeEnvironmentSchema = z.object(runtimeEnvironmentShape).strict().superRefine((env, ctx) => {
  if ((env.SESSION_JWT_PRIVATE_KEY && !env.SESSION_JWT_PUBLIC_KEY)
      || (!env.SESSION_JWT_PRIVATE_KEY && env.SESSION_JWT_PUBLIC_KEY)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["SESSION_JWT_PRIVATE_KEY"],
      message: "SESSION_JWT_PRIVATE_KEY and SESSION_JWT_PUBLIC_KEY must be configured together.",
    });
  }

  if (env.COLLECTION_PII_RETIRED_FIELDS && !env.COLLECTION_PII_ENCRYPTION_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["COLLECTION_PII_ENCRYPTION_KEY"],
      message: "COLLECTION_PII_ENCRYPTION_KEY is required when COLLECTION_PII_RETIRED_FIELDS is set.",
    });
  }
});

const KNOWN_RUNTIME_ENV_KEYS = new Set(Object.keys(runtimeEnvironmentShape));
const APPLICATION_ENV_KEY_PATTERNS = [
  /^(?:ALLOW|AUTH|BACKUP|COLLECTION|CORS|DATABASE|DEBUG|DEFAULT|GRACEFUL|HOST|HSTS|HTTP|IMPORT|LOCAL|LOG|MAIL|MAINTENANCE|OLLAMA|OPERATIONS|PG|PUBLIC|RUNTIME|SEED|SESSION|SMTP|SQR|TRUSTED|TWO_FACTOR|AI)_/,
  /^(?:ANALYTICS_TZ|PORT|PGHOST|PGPORT|PGUSER|PGPASSWORD|PGDATABASE)$/,
] as const;

function shouldValidateRuntimeEnvKey(key: string) {
  if (KNOWN_RUNTIME_ENV_KEYS.has(key)) {
    return true;
  }

  return APPLICATION_ENV_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function selectRuntimeEnvironmentForValidation(env: RuntimeEnvironmentSource) {
  const selected: RuntimeEnvironmentSource = {};
  for (const [key, value] of Object.entries(env)) {
    if (shouldValidateRuntimeEnvKey(key)) {
      selected[key] = value;
    }
  }
  return selected;
}

function formatRuntimeEnvIssue(issue: z.ZodIssue) {
  const envName = issue.path.join(".") || "runtime environment";
  return `${envName}: ${issue.message}`;
}

export function validateRuntimeEnvironmentSchema(env: RuntimeEnvironmentSource = process.env) {
  const result = runtimeEnvironmentSchema.safeParse(selectRuntimeEnvironmentForValidation(env));
  if (result.success) {
    return;
  }

  throw new Error(
    `Invalid runtime environment configuration: ${result.error.issues
      .map(formatRuntimeEnvIssue)
      .join("; ")}`,
  );
}

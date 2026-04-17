import { z } from "zod";

type RuntimeEnvironmentSource = Record<string, string | undefined>;

const DEFAULT_STRING_MAX_LENGTH = 4_096;
const SECRET_STRING_MAX_LENGTH = 8_192;
const BOOLEAN_ENV_VALUES = new Set(["1", "0", "true", "false", "yes", "no", "on", "off"]);
const AUTH_COOKIE_SECURE_VALUES = new Set(["auto", "true", "false", "1", "0"]);
const COLLECTION_PII_FIELD_VALUES = new Set([
  "customerName",
  "icNumber",
  "customerPhone",
  "accountNumber",
]);

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
        return fields.every((field) => COLLECTION_PII_FIELD_VALUES.has(field));
      }, `${name} must contain only: customerName, icNumber, customerPhone, accountNumber.`)
      .optional(),
  );
}

const runtimeEnvironmentSchema = z.object({
  NODE_ENV: optionalEnvString("NODE_ENV", 64),
  DEBUG_LOGS: optionalBooleanEnv("DEBUG_LOGS"),
  OPERATIONS_DEBUG_ROUTES_ENABLED: optionalBooleanEnv("OPERATIONS_DEBUG_ROUTES_ENABLED"),
  LOG_LEVEL: optionalEnvString("LOG_LEVEL", 64),
  HOST: optionalEnvString("HOST", 255),
  PORT: optionalIntEnv("PORT", { min: 1, max: 65_535 }),
  PUBLIC_APP_URL: optionalEnvString("PUBLIC_APP_URL"),
  DEFAULT_BODY_LIMIT: optionalEnvString("DEFAULT_BODY_LIMIT", 64),
  IMPORT_BODY_LIMIT: optionalEnvString("IMPORT_BODY_LIMIT", 64),
  IMPORT_CSV_MAX_ROWS: optionalIntEnv("IMPORT_CSV_MAX_ROWS", {
    min: 1,
    max: 1_000_000,
  }),
  COLLECTION_BODY_LIMIT: optionalEnvString("COLLECTION_BODY_LIMIT", 64),
  CORS_ALLOWED_ORIGINS: optionalEnvString("CORS_ALLOWED_ORIGINS"),
  TRUSTED_PROXIES: optionalEnvString("TRUSTED_PROXIES"),
  ALLOW_LOCAL_DEV_CORS: optionalBooleanEnv("ALLOW_LOCAL_DEV_CORS"),
  HTTP_SLOW_REQUEST_MS: optionalIntEnv("HTTP_SLOW_REQUEST_MS", { min: 250 }),
  HTTP_REQUEST_TIMEOUT_MS: optionalIntEnv("HTTP_REQUEST_TIMEOUT_MS", { min: 1_000 }),
  PG_POOL_ALERT_WAITING_COUNT: optionalIntEnv("PG_POOL_ALERT_WAITING_COUNT", { min: 1, max: 1_000 }),
  PG_POOL_ALERT_UTILIZATION_PERCENT: optionalIntEnv("PG_POOL_ALERT_UTILIZATION_PERCENT", { min: 50, max: 100 }),
  PG_POOL_HEALTH_CHECK_INTERVAL_MS: optionalIntEnv("PG_POOL_HEALTH_CHECK_INTERVAL_MS", { min: 1_000 }),
  PG_POOL_HEALTH_CHECK_TIMEOUT_MS: optionalIntEnv("PG_POOL_HEALTH_CHECK_TIMEOUT_MS", { min: 250 }),
  BACKUP_RESTORE_MAX_TRACKED_COLLECTION_RECORD_IDS: optionalIntEnv(
    "BACKUP_RESTORE_MAX_TRACKED_COLLECTION_RECORD_IDS",
    { min: 1_000, max: 2_000_000 },
  ),

  DATABASE_URL: optionalEnvString("DATABASE_URL", SECRET_STRING_MAX_LENGTH),
  PG_HOST: optionalEnvString("PG_HOST", 255),
  PG_PORT: optionalIntEnv("PG_PORT", { min: 1, max: 65_535 }),
  PG_USER: optionalEnvString("PG_USER", 255),
  PG_PASSWORD: optionalEnvString("PG_PASSWORD", SECRET_STRING_MAX_LENGTH),
  PG_DATABASE: optionalEnvString("PG_DATABASE", 255),
  PG_MAX_CONNECTIONS: optionalIntEnv("PG_MAX_CONNECTIONS", { min: 1, max: 50 }),
  PG_IDLE_TIMEOUT_MS: optionalIntEnv("PG_IDLE_TIMEOUT_MS", { min: 1_000 }),
  PG_CONNECTION_TIMEOUT_MS: optionalIntEnv("PG_CONNECTION_TIMEOUT_MS", { min: 1_000 }),
  PG_QUERY_TIMEOUT_MS: optionalIntEnv("PG_QUERY_TIMEOUT_MS", { min: 1_000 }),
  PG_STATEMENT_TIMEOUT_MS: optionalIntEnv("PG_STATEMENT_TIMEOUT_MS", { min: 1_000 }),
  PG_SEARCH_PATH: optionalEnvString("PG_SEARCH_PATH", 255),

  SESSION_SECRET: optionalEnvString("SESSION_SECRET", SECRET_STRING_MAX_LENGTH),
  SESSION_SECRET_PREVIOUS: optionalEnvString("SESSION_SECRET_PREVIOUS", SECRET_STRING_MAX_LENGTH),
  TWO_FACTOR_ENCRYPTION_KEY: optionalEnvString("TWO_FACTOR_ENCRYPTION_KEY", SECRET_STRING_MAX_LENGTH),
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
  COLLECTION_NICKNAME_TEMP_PASSWORD: optionalEnvString(
    "COLLECTION_NICKNAME_TEMP_PASSWORD",
    SECRET_STRING_MAX_LENGTH,
  ),
  AUTH_COOKIE_SECURE: optionalAuthCookieSecureEnv(),
  SEED_DEFAULT_USERS: optionalBooleanEnv("SEED_DEFAULT_USERS"),
  LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED: optionalBooleanEnv(
    "LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED",
  ),
  SEED_SUPERUSER_USERNAME: optionalEnvString("SEED_SUPERUSER_USERNAME", 255),
  SEED_SUPERUSER_PASSWORD: optionalEnvString("SEED_SUPERUSER_PASSWORD", SECRET_STRING_MAX_LENGTH),
  SEED_SUPERUSER_FULL_NAME: optionalEnvString("SEED_SUPERUSER_FULL_NAME", 255),
  SEED_SUPERUSER_TWO_FACTOR_SECRET: optionalEnvString(
    "SEED_SUPERUSER_TWO_FACTOR_SECRET",
    SECRET_STRING_MAX_LENGTH,
  ),
  SEED_ADMIN_USERNAME: optionalEnvString("SEED_ADMIN_USERNAME", 255),
  SEED_ADMIN_PASSWORD: optionalEnvString("SEED_ADMIN_PASSWORD", SECRET_STRING_MAX_LENGTH),
  SEED_ADMIN_FULL_NAME: optionalEnvString("SEED_ADMIN_FULL_NAME", 255),
  SEED_ADMIN_TWO_FACTOR_SECRET: optionalEnvString(
    "SEED_ADMIN_TWO_FACTOR_SECRET",
    SECRET_STRING_MAX_LENGTH,
  ),
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
  BACKUP_FEATURE_ENABLED: optionalBooleanEnv("BACKUP_FEATURE_ENABLED"),
  BACKUP_MAX_PAYLOAD_BYTES: optionalIntEnv("BACKUP_MAX_PAYLOAD_BYTES", {
    min: 1_048_576,
    max: 536_870_912,
  }),

  SMTP_SERVICE: optionalEnvString("SMTP_SERVICE", 255),
  SMTP_HOST: optionalEnvString("SMTP_HOST", 255),
  SMTP_PORT: optionalIntEnv("SMTP_PORT", { min: 1, max: 65_535 }),
  SMTP_USER: optionalEnvString("SMTP_USER", 255),
  SMTP_PASSWORD: optionalEnvString("SMTP_PASSWORD", SECRET_STRING_MAX_LENGTH),
  SMTP_SECURE: optionalBooleanEnv("SMTP_SECURE"),
  SMTP_REQUIRE_TLS: optionalBooleanEnv("SMTP_REQUIRE_TLS"),
  MAIL_FROM: optionalEnvString("MAIL_FROM", 255),

  OLLAMA_HOST: optionalEnvString("OLLAMA_HOST"),
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
  AI_GATE_SUPERUSER_LIMIT: optionalIntEnv("AI_GATE_SUPERUSER_LIMIT", { min: 1 }),
  AI_LATENCY_STALE_AFTER_MS: optionalIntEnv("AI_LATENCY_STALE_AFTER_MS", { min: 5_000 }),
  AI_LATENCY_DECAY_HALF_LIFE_MS: optionalIntEnv("AI_LATENCY_DECAY_HALF_LIFE_MS", { min: 5_000 }),
  SQR_MAX_SEARCH_CACHE_ENTRIES: optionalIntEnv("SQR_MAX_SEARCH_CACHE_ENTRIES", { min: 10 }),
  SQR_MAX_AI_LAST_PERSON_ENTRIES: optionalIntEnv("SQR_MAX_AI_LAST_PERSON_ENTRIES", { min: 10 }),
  SQR_AI_LAST_PERSON_TTL_MS: optionalIntEnv("SQR_AI_LAST_PERSON_TTL_MS", { min: 60_000 }),
  SQR_LOW_MEMORY_MODE: optionalBooleanEnv("SQR_LOW_MEMORY_MODE"),

  DEFAULT_SESSION_TIMEOUT_MINUTES: optionalIntEnv("DEFAULT_SESSION_TIMEOUT_MINUTES", { min: 1 }),
  DEFAULT_WS_IDLE_MINUTES: optionalIntEnv("DEFAULT_WS_IDLE_MINUTES", { min: 1 }),
  DEFAULT_AI_TIMEOUT_MS: optionalIntEnv("DEFAULT_AI_TIMEOUT_MS", { min: 1_000 }),
  DEFAULT_SEARCH_RESULT_LIMIT: optionalIntEnv("DEFAULT_SEARCH_RESULT_LIMIT", { min: 10, max: 5_000 }),
  DEFAULT_VIEWER_ROWS_PER_PAGE: optionalIntEnv("DEFAULT_VIEWER_ROWS_PER_PAGE", { min: 10, max: 500 }),
  MAINTENANCE_CACHE_TTL_MS: optionalIntEnv("MAINTENANCE_CACHE_TTL_MS", { min: 500 }),
  RUNTIME_SETTINGS_CACHE_TTL_MS: optionalIntEnv("RUNTIME_SETTINGS_CACHE_TTL_MS", { min: 500 }),
  PG_POOL_WARN_COOLDOWN_MS: optionalIntEnv("PG_POOL_WARN_COOLDOWN_MS", { min: 1_000 }),
  GRACEFUL_SHUTDOWN_TIMEOUT_MS: optionalIntEnv("GRACEFUL_SHUTDOWN_TIMEOUT_MS", { min: 1_000 }),
  COLLECTION_ROUTE_WARN_MS: optionalIntEnv("COLLECTION_ROUTE_WARN_MS", { min: 250 }),
  ANALYTICS_TZ: optionalEnvString("ANALYTICS_TZ", 255),
  BACKUP_OPERATION_TIMEOUT_MS: optionalIntEnv("BACKUP_OPERATION_TIMEOUT_MS", { min: 5_000 }),
  IMPORT_ANALYSIS_TIMEOUT_MS: optionalIntEnv("IMPORT_ANALYSIS_TIMEOUT_MS", { min: 5_000 }),
  COLLECTION_ROLLUP_LISTEN_RECONNECT_MS: optionalIntEnv(
    "COLLECTION_ROLLUP_LISTEN_RECONNECT_MS",
    { min: 1_000 },
  ),
  DB_QUERY_PROFILING_ENABLED: optionalBooleanEnv("DB_QUERY_PROFILING_ENABLED"),
  DB_QUERY_PROFILING_ALLOW_IN_PRODUCTION: optionalBooleanEnv("DB_QUERY_PROFILING_ALLOW_IN_PRODUCTION"),
  DB_QUERY_PROFILING_SAMPLE_PERCENT: optionalIntEnv("DB_QUERY_PROFILING_SAMPLE_PERCENT", {
    min: 0,
    max: 100,
  }),
  DB_QUERY_PROFILING_MIN_QUERY_COUNT: optionalIntEnv("DB_QUERY_PROFILING_MIN_QUERY_COUNT", {
    min: 1,
  }),
  DB_QUERY_PROFILING_MIN_TOTAL_QUERY_MS: optionalIntEnv("DB_QUERY_PROFILING_MIN_TOTAL_QUERY_MS", {
    min: 0,
  }),
  DB_QUERY_PROFILING_REPEATED_STATEMENT_THRESHOLD: optionalIntEnv(
    "DB_QUERY_PROFILING_REPEATED_STATEMENT_THRESHOLD",
    { min: 2 },
  ),
  DB_QUERY_PROFILING_MAX_LOGGED_STATEMENTS: optionalIntEnv(
    "DB_QUERY_PROFILING_MAX_LOGGED_STATEMENTS",
    { min: 1, max: 20 },
  ),
  DB_QUERY_PROFILING_MAX_UNIQUE_STATEMENTS: optionalIntEnv(
    "DB_QUERY_PROFILING_MAX_UNIQUE_STATEMENTS",
    { min: 10, max: 1_000 },
  ),
  CLIENT_ERROR_TELEMETRY_ENABLED: optionalBooleanEnv("CLIENT_ERROR_TELEMETRY_ENABLED"),
  REMOTE_ERROR_TRACKING_ENABLED: optionalBooleanEnv("REMOTE_ERROR_TRACKING_ENABLED"),
  REMOTE_ERROR_TRACKING_ENDPOINT: optionalEnvString("REMOTE_ERROR_TRACKING_ENDPOINT"),
  REMOTE_ERROR_TRACKING_TIMEOUT_MS: optionalIntEnv("REMOTE_ERROR_TRACKING_TIMEOUT_MS", {
    min: 500,
    max: 30_000,
  }),

  SQR_FORCE_CLUSTER: optionalBooleanEnv("SQR_FORCE_CLUSTER"),
  SQR_MAX_WORKERS: optionalIntEnv("SQR_MAX_WORKERS", { min: 1 }),
  SQR_INITIAL_WORKERS: optionalIntEnv("SQR_INITIAL_WORKERS", { min: 1 }),
  SQR_PREALLOCATE_MB: optionalIntEnv("SQR_PREALLOCATE_MB", { min: 0 }),
}).passthrough().superRefine((env, ctx) => {
  if (env.COLLECTION_PII_RETIRED_FIELDS && !env.COLLECTION_PII_ENCRYPTION_KEY) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["COLLECTION_PII_ENCRYPTION_KEY"],
      message: "COLLECTION_PII_ENCRYPTION_KEY is required when COLLECTION_PII_RETIRED_FIELDS is set.",
    });
  }
});

function formatRuntimeEnvIssue(issue: z.ZodIssue) {
  const envName = issue.path.join(".") || "runtime environment";
  return `${envName}: ${issue.message}`;
}

export function validateRuntimeEnvironmentSchema(env: RuntimeEnvironmentSource = process.env) {
  const result = runtimeEnvironmentSchema.safeParse(env);
  if (result.success) {
    return;
  }

  throw new Error(
    `Invalid runtime environment configuration: ${result.error.issues
      .map(formatRuntimeEnvIssue)
      .join("; ")}`,
  );
}

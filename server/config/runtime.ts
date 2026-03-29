import path from "node:path";
import { randomBytes } from "node:crypto";
import {
  isProductionLikeEnvironment,
  isStrictLocalDevelopmentEnvironment,
  readBooleanEnvFlag,
  resolveRuntimeEnvironment,
  type RuntimeEnvironment,
} from "./runtime-environment";

export type RuntimeConfigDiagnostic = {
  code: string;
  envNames: string[];
  message: string;
  severity: "warning";
};

export type RuntimeConfigValidation = {
  warningCount: number;
  warnings: readonly RuntimeConfigDiagnostic[];
};

type MailConfigurationAssessment = {
  effectiveFrom: string | null;
  hasAnyInput: boolean;
  isConfigured: boolean;
  isIncomplete: boolean;
};

type RuntimeConfig = {
  app: {
    nodeEnv: RuntimeEnvironment;
    isProduction: boolean;
    isProductionLike: boolean;
    isStrictLocalDevelopment: boolean;
    port: number;
    host: string;
    publicAppUrl: string | null;
    debugLogs: boolean;
    uploadsRootDir: string;
    bodyLimits: {
      default: string;
      imports: string;
      collection: string;
    };
    corsAllowedOrigins: string[];
    trustedProxies: string[];
  };
  database: {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    maxConnections: number;
    idleTimeoutMs: number;
    connectionTimeoutMs: number;
    searchPath: string;
  };
  auth: {
    sessionSecret: string;
    previousSessionSecrets: string[];
    collectionNicknameTempPassword: string;
    seedDefaultUsers: boolean;
    cookieSecure: boolean;
  };
  ai: {
    host: string;
    chatModel: string;
    embedModel: string;
    timeoutMs: number;
    precomputeOnStart: boolean;
    lowMemoryMode: boolean;
    debugLogs: boolean;
    gate: {
      globalLimit: number;
      queueLimit: number;
      queueWaitMs: number;
      roleLimits: {
        user: number;
        admin: number;
        superuser: number;
      };
    };
    latency: {
      staleAfterMs: number;
      decayHalfLifeMs: number;
    };
    cache: {
      maxSearchEntries: number;
      maxLastPersonEntries: number;
      lastPersonTtlMs: number;
    };
  };
  runtime: {
    defaults: {
      sessionTimeoutMinutes: number;
      wsIdleMinutes: number;
      aiTimeoutMs: number;
      searchResultLimit: number;
      viewerRowsPerPage: number;
    };
    maintenanceCacheTtlMs: number;
    runtimeSettingsCacheTtlMs: number;
    pgPoolWarnCooldownMs: number;
    backupOperationTimeoutMs: number;
    importAnalysisTimeoutMs: number;
    collectionRollupListenReconnectMs: number;
  };
  cluster: {
    lowMemoryMode: boolean;
    maxWorkers: number;
    initialWorkers: number;
    preallocateMb: number;
  };
};

const HTTP_PROTOCOLS = new Set(["http:", "https:"]);
const AUTO_COOKIE_SECURE_VALUES = new Set(["", "auto", "1", "true", "0", "false"]);
const PLACEHOLDER_SESSION_SECRETS = new Set(["change-this-session-secret"]);
const PLACEHOLDER_DATABASE_PASSWORDS = new Set(["change-this-db-password"]);
const UNSAFE_TRUST_PROXY_VALUES = new Set(["*", "all", "true", "1"]);

function readOptionalString(name: string): string | null {
  const value = process.env[name];
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized ? normalized : null;
}

function readString(name: string, fallback: string): string {
  return readOptionalString(name) ?? fallback;
}

function readInt(name: string, fallback: number, options?: { min?: number; max?: number }): number {
  const raw = readOptionalString(name);
  const parsed = raw == null ? fallback : Number(raw);
  const normalized = Number.isFinite(parsed) ? Math.floor(parsed) : fallback;
  const min = options?.min ?? Number.NEGATIVE_INFINITY;
  const max = options?.max ?? Number.POSITIVE_INFINITY;
  return Math.max(min, Math.min(max, normalized));
}

function readBoolean(name: string, fallback: boolean): boolean {
  return readBooleanEnvFlag(name, fallback);
}

function readCommaSeparatedList(name: string): string[] {
  const raw = readOptionalString(name);
  if (!raw) {
    return [];
  }

  return Array.from(
    new Set(
      raw
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

function normalizeHttpUrl(name: string, rawValue: string | null): string | null {
  if (!rawValue) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(rawValue);
  } catch {
    throw new Error(`${name} must be a valid absolute http:// or https:// URL.`);
  }

  if (!HTTP_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`${name} must use http:// or https://.`);
  }

  return parsed.toString().replace(/\/+$/, "");
}

function normalizeCorsOrigin(name: string, rawValue: string): string {
  let parsed: URL;
  try {
    parsed = new URL(rawValue);
  } catch {
    throw new Error(`${name} entries must be valid absolute origins.`);
  }

  if (!HTTP_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`${name} entries must use http:// or https://.`);
  }

  if ((parsed.pathname && parsed.pathname !== "/") || parsed.search || parsed.hash) {
    throw new Error(`${name} entries must be bare origins without paths, query strings, or hashes.`);
  }

  return parsed.origin;
}

function buildEphemeralSecret(label: string) {
  return `${label.toLowerCase()}-${randomBytes(32).toString("hex")}`;
}

function resolveTrustedProxies(rawValues: string[]): string[] {
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

function resolvePreviousSessionSecrets(rawValues: string[], currentSessionSecret: string | null): string[] {
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

function readSecretOrThrow(name: string, label: string, isRequired: boolean, fallbackFactory: () => string) {
  const value = readOptionalString(name);
  if (value) {
    return value;
  }
  if (isRequired) {
    throw new Error(`${name} is required outside strict local development.`);
  }
  return fallbackFactory();
}

function resolveNodeEnv(): RuntimeEnvironment {
  return resolveRuntimeEnvironment(process.env.NODE_ENV);
}

function resolveCookieSecure(isProduction: boolean, publicAppUrl: string | null) {
  const explicit = String(readOptionalString("AUTH_COOKIE_SECURE") || "").toLowerCase();
  if (!AUTO_COOKIE_SECURE_VALUES.has(explicit)) {
    throw new Error("AUTH_COOKIE_SECURE must be one of: auto, true, false, 1, or 0.");
  }
  if (explicit === "1" || explicit === "true") {
    return true;
  }
  if (explicit === "0" || explicit === "false") {
    return false;
  }
  return isProduction || String(publicAppUrl || "").toLowerCase().startsWith("https://");
}

function resolveCorsAllowedOrigins(publicAppUrl: string | null) {
  const configured = readString("CORS_ALLOWED_ORIGINS", "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => normalizeCorsOrigin("CORS_ALLOWED_ORIGINS", entry));

  if (publicAppUrl && !configured.includes(publicAppUrl)) {
    configured.push(new URL(publicAppUrl).origin);
  }

  return Array.from(new Set(configured));
}

function hasBackupEncryptionKeyConfigured(): boolean {
  return Boolean(
    readOptionalString("BACKUP_ENCRYPTION_KEY")
    || readOptionalString("BACKUP_ENCRYPTION_KEYS"),
  );
}

function isBackupFeatureEnabled(): boolean {
  return readBoolean("BACKUP_FEATURE_ENABLED", true);
}

function assessMailConfiguration(params: {
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

function assertRuntimeSafetyGuards(params: {
  isProductionLike: boolean;
  isStrictLocalDevelopment: boolean;
  mailConfiguration: MailConfigurationAssessment;
}) {
  const { isProductionLike, isStrictLocalDevelopment, mailConfiguration } = params;

  if (isProductionLike && isBackupFeatureEnabled() && !hasBackupEncryptionKeyConfigured()) {
    throw new Error(
      "BACKUP_ENCRYPTION_KEY or BACKUP_ENCRYPTION_KEYS is required when backups are enabled outside strict local development.",
    );
  }

  if (!isStrictLocalDevelopment && readBoolean("SEED_DEFAULT_USERS", false)) {
    throw new Error(
      "SEED_DEFAULT_USERS is only allowed in strict local development mode.",
    );
  }

  if (!isStrictLocalDevelopment && readBoolean("LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED", false)) {
    throw new Error(
      "LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED is only allowed in strict local development mode.",
    );
  }

  if (!isStrictLocalDevelopment && readBoolean("MAIL_DEV_OUTBOX_ENABLED", false)) {
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

function buildRuntimeConfigWarnings(params: {
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

function assertNoPlaceholderSecrets(params: {
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

const nodeEnv = resolveNodeEnv();
const isProduction = nodeEnv === "production";
const isStrictLocalDevelopment = isStrictLocalDevelopmentEnvironment();
const isProductionLike = isProductionLikeEnvironment();
const configuredSessionSecret = readOptionalString("SESSION_SECRET");
const configuredPreviousSessionSecrets = resolvePreviousSessionSecrets(
  readCommaSeparatedList("SESSION_SECRET_PREVIOUS"),
  configuredSessionSecret,
);
const configuredCollectionNicknameTempPassword = readOptionalString("COLLECTION_NICKNAME_TEMP_PASSWORD");
const configuredPgPassword = readOptionalString("PG_PASSWORD");
const publicAppUrl = normalizeHttpUrl("PUBLIC_APP_URL", readOptionalString("PUBLIC_APP_URL"));
const trustedProxies = resolveTrustedProxies(readCommaSeparatedList("TRUSTED_PROXIES"));
const lowMemoryMode = readBoolean("SQR_LOW_MEMORY_MODE", true);
const mailConfiguration = assessMailConfiguration({
  smtpService: readOptionalString("SMTP_SERVICE"),
  smtpHost: readOptionalString("SMTP_HOST"),
  smtpUser: readOptionalString("SMTP_USER"),
  smtpPassword: readOptionalString("SMTP_PASSWORD"),
  mailFrom: readOptionalString("MAIL_FROM"),
});
assertRuntimeSafetyGuards({ isProductionLike, isStrictLocalDevelopment, mailConfiguration });
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
    debugLogs: readBoolean("DEBUG_LOGS", false),
    uploadsRootDir: path.resolve(process.cwd(), "uploads"),
    bodyLimits: {
      default: readString("DEFAULT_BODY_LIMIT", "2mb"),
      imports: readString("IMPORT_BODY_LIMIT", "50mb"),
      collection: readString("COLLECTION_BODY_LIMIT", "8mb"),
    },
    corsAllowedOrigins: resolveCorsAllowedOrigins(publicAppUrl),
    trustedProxies,
  },
  database: {
    host: readString("PG_HOST", "localhost"),
    port: readInt("PG_PORT", 5432, { min: 1, max: 65535 }),
    user: readString("PG_USER", "postgres"),
    password: (() => {
      const configured = readOptionalString("PG_PASSWORD");
      if (configured) {
        return configured;
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
    sessionSecret: readSecretOrThrow("SESSION_SECRET", "session", isProductionLike, () =>
      buildEphemeralSecret("session")),
    previousSessionSecrets: configuredPreviousSessionSecrets,
    collectionNicknameTempPassword: readSecretOrThrow(
      "COLLECTION_NICKNAME_TEMP_PASSWORD",
      "collection temp password",
      isProductionLike,
      () => buildEphemeralSecret("collection-temp").slice(0, 16),
    ),
    seedDefaultUsers: readBoolean("SEED_DEFAULT_USERS", false),
    cookieSecure: resolveCookieSecure(isProduction, publicAppUrl),
  },
  ai: {
    host: readString("OLLAMA_HOST", "http://127.0.0.1:11434"),
    chatModel: readString("OLLAMA_CHAT_MODEL", "llama3:8b"),
    embedModel: readString("OLLAMA_EMBED_MODEL", "nomic-embed-text"),
    timeoutMs: readInt("OLLAMA_TIMEOUT_MS", 6_000, { min: 1_000 }),
    precomputeOnStart: readBoolean("AI_PRECOMPUTE_ON_START", false),
    lowMemoryMode,
    debugLogs: readBoolean("DEBUG_LOGS", false),
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

export const runtimeConfigValidation: RuntimeConfigValidation = Object.freeze({
  warningCount: runtimeWarnings.length,
  warnings: Object.freeze(runtimeWarnings.map((warning) => Object.freeze({ ...warning }))),
});

import path from "node:path";
import { randomBytes } from "node:crypto";

type RuntimeEnvironment = "development" | "test" | "production";

type RuntimeConfig = {
  app: {
    nodeEnv: RuntimeEnvironment;
    isProduction: boolean;
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
  };
  database: {
    host: string;
    port: number;
    user: string;
    password?: string;
    database: string;
    maxConnections: number;
    idleTimeoutMs: number;
    connectionTimeoutMs: number;
    searchPath: string;
  };
  auth: {
    sessionSecret: string;
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
  };
  cluster: {
    lowMemoryMode: boolean;
    maxWorkers: number;
    preallocateMb: number;
  };
};

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
  const raw = String(readOptionalString(name) ?? "").trim().toLowerCase();
  if (raw === "1" || raw === "true") return true;
  if (raw === "0" || raw === "false") return false;
  return fallback;
}

function buildEphemeralSecret(label: string) {
  return `${label.toLowerCase()}-${randomBytes(32).toString("hex")}`;
}

function readSecretOrThrow(name: string, label: string, isProduction: boolean, fallbackFactory: () => string) {
  const value = readOptionalString(name);
  if (value) {
    return value;
  }
  if (isProduction) {
    throw new Error(`${name} is required in production.`);
  }
  return fallbackFactory();
}

function resolveNodeEnv(): RuntimeEnvironment {
  const raw = String(process.env.NODE_ENV || "development").trim().toLowerCase();
  if (raw === "production" || raw === "test") {
    return raw;
  }
  return "development";
}

function resolveCookieSecure(isProduction: boolean, publicAppUrl: string | null) {
  const explicit = String(readOptionalString("AUTH_COOKIE_SECURE") || "").toLowerCase();
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
    .filter(Boolean);

  if (publicAppUrl && !configured.includes(publicAppUrl)) {
    configured.push(publicAppUrl);
  }

  return configured;
}

function hasBackupEncryptionKeyConfigured(): boolean {
  return Boolean(
    readOptionalString("BACKUP_ENCRYPTION_KEY")
    || readOptionalString("BACKUP_ENCRYPTION_KEYS"),
  );
}

function assertProductionSafetyGuards(isProduction: boolean) {
  if (!isProduction) {
    return;
  }

  if (!hasBackupEncryptionKeyConfigured()) {
    throw new Error(
      "BACKUP_ENCRYPTION_KEY or BACKUP_ENCRYPTION_KEYS is required in production.",
    );
  }

  if (readBoolean("SEED_DEFAULT_USERS", false)) {
    throw new Error("SEED_DEFAULT_USERS must be disabled in production.");
  }

  if (readBoolean("LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED", false)) {
    throw new Error(
      "LOCAL_SUPERUSER_CREDENTIALS_FILE_ENABLED is not allowed in production.",
    );
  }

  if (readBoolean("MAIL_DEV_OUTBOX_ENABLED", false)) {
    throw new Error("MAIL_DEV_OUTBOX_ENABLED must be disabled in production.");
  }
}

const nodeEnv = resolveNodeEnv();
const isProduction = nodeEnv === "production";
const publicAppUrl = readOptionalString("PUBLIC_APP_URL");
const lowMemoryMode = readBoolean("SQR_LOW_MEMORY_MODE", true);
assertProductionSafetyGuards(isProduction);

export const runtimeConfig: RuntimeConfig = Object.freeze({
  app: {
    nodeEnv,
    isProduction,
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
      if (isProduction) {
        throw new Error("PG_PASSWORD is required in production.");
      }
      return undefined;
    })(),
    database: readString("PG_DATABASE", "sqr_db"),
    maxConnections: readInt("PG_MAX_CONNECTIONS", 5, { min: 1, max: 50 }),
    idleTimeoutMs: readInt("PG_IDLE_TIMEOUT_MS", 30_000, { min: 1_000 }),
    connectionTimeoutMs: readInt("PG_CONNECTION_TIMEOUT_MS", 5_000, { min: 1_000 }),
    searchPath: readString("PG_SEARCH_PATH", "public"),
  },
  auth: {
    sessionSecret: readSecretOrThrow("SESSION_SECRET", "session", isProduction, () =>
      buildEphemeralSecret("session")),
    collectionNicknameTempPassword: readSecretOrThrow(
      "COLLECTION_NICKNAME_TEMP_PASSWORD",
      "collection temp password",
      isProduction,
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
  },
  cluster: {
    lowMemoryMode,
    maxWorkers: readInt("SQR_MAX_WORKERS", lowMemoryMode ? 1 : 4, { min: 1 }),
    preallocateMb: readInt("SQR_PREALLOCATE_MB", lowMemoryMode ? 0 : 32, { min: 0 }),
  },
});

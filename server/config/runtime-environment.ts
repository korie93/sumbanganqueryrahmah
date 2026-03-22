type RuntimeEnvironmentWithOther = "development" | "test" | "production" | "other";

export type RuntimeEnvironment = "development" | "test" | "production";

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

type RuntimeEnvironmentSource = Record<string, string | undefined>;

function readOptionalString(name: string, env: RuntimeEnvironmentSource): string | null {
  const value = env[name];
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized ? normalized : null;
}

export function readBooleanEnvFlag(
  name: string,
  fallback: boolean,
  env: RuntimeEnvironmentSource = process.env,
): boolean {
  const raw = String(readOptionalString(name, env) ?? "").trim().toLowerCase();
  if (!raw) return fallback;
  if (TRUE_VALUES.has(raw)) return true;
  if (FALSE_VALUES.has(raw)) return false;
  return fallback;
}

export function normalizeRuntimeEnvironment(rawValue: unknown): RuntimeEnvironmentWithOther {
  const raw = String(rawValue || "development").trim().toLowerCase();
  if (raw === "development" || raw === "test" || raw === "production") {
    return raw;
  }
  return "other";
}

export function resolveRuntimeEnvironment(rawValue: unknown): RuntimeEnvironment {
  const normalized = normalizeRuntimeEnvironment(rawValue);
  if (normalized === "production" || normalized === "test") {
    return normalized;
  }
  return "development";
}

export function isLoopbackHostname(value: string): boolean {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "127.0.0.1" || normalized === "localhost" || normalized === "::1";
}

function resolvePublicAppHost(env: RuntimeEnvironmentSource): string | null {
  const publicBaseUrl =
    readOptionalString("PUBLIC_APP_URL", env)
    || readOptionalString("APP_BASE_URL", env)
    || readOptionalString("CLIENT_APP_URL", env);
  if (!publicBaseUrl) {
    return null;
  }

  try {
    return new URL(publicBaseUrl).hostname || null;
  } catch {
    return null;
  }
}

export function isStrictLocalDevelopmentEnvironment(
  env: RuntimeEnvironmentSource = process.env,
): boolean {
  if (normalizeRuntimeEnvironment(env.NODE_ENV) !== "development") {
    return false;
  }

  const host = readOptionalString("HOST", env);
  if (host && !isLoopbackHostname(host)) {
    return false;
  }

  const publicAppHost = resolvePublicAppHost(env);
  if (!publicAppHost) {
    return true;
  }
  return isLoopbackHostname(publicAppHost);
}

export function isProductionLikeEnvironment(
  env: RuntimeEnvironmentSource = process.env,
): boolean {
  const nodeEnv = normalizeRuntimeEnvironment(env.NODE_ENV);
  if (nodeEnv === "test") {
    return false;
  }
  if (nodeEnv === "production" || nodeEnv === "other") {
    return true;
  }
  return !isStrictLocalDevelopmentEnvironment(env);
}


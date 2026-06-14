type RuntimeEnvironmentWithOther = "development" | "test" | "production" | "other";

export type RuntimeEnvironment = "development" | "test" | "production";

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);

export type RuntimeEnvironmentSource = Record<string, string | undefined>;

export function getRuntimeEnvironmentSource(): NodeJS.ProcessEnv {
  return process.env;
}

export function readOptionalEnvString(
  name: string,
  env: RuntimeEnvironmentSource = getRuntimeEnvironmentSource(),
): string | null {
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
  env: RuntimeEnvironmentSource = getRuntimeEnvironmentSource(),
): boolean {
  const raw = String(readOptionalEnvString(name, env) ?? "").trim().toLowerCase();
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
    readOptionalEnvString("PUBLIC_APP_URL", env)
    || readOptionalEnvString("APP_BASE_URL", env)
    || readOptionalEnvString("CLIENT_APP_URL", env);
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
  env: RuntimeEnvironmentSource = getRuntimeEnvironmentSource(),
): boolean {
  if (normalizeRuntimeEnvironment(env.NODE_ENV) !== "development") {
    return false;
  }

  const host = readOptionalEnvString("HOST", env);
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
  env: RuntimeEnvironmentSource = getRuntimeEnvironmentSource(),
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


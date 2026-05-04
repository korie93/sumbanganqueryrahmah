export type RuntimeDatabaseSslConfig = {
  enabled: boolean;
  rejectUnauthorized: true;
};

const BOOLEAN_TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const BOOLEAN_FALSE_VALUES = new Set(["0", "false", "no", "off"]);

export function resolveDatabaseSslConfig(
  rawValue: string | null,
  params: { isProductionLike: boolean },
): RuntimeDatabaseSslConfig {
  const normalized = String(rawValue || "").trim().toLowerCase();

  if (!normalized) {
    return {
      enabled: params.isProductionLike,
      rejectUnauthorized: true,
    };
  }

  if (BOOLEAN_TRUE_VALUES.has(normalized)) {
    return {
      enabled: true,
      rejectUnauthorized: true,
    };
  }

  if (BOOLEAN_FALSE_VALUES.has(normalized)) {
    if (params.isProductionLike) {
      throw new Error("DATABASE_SSL=false is not allowed on production-like hosts.");
    }

    return {
      enabled: false,
      rejectUnauthorized: true,
    };
  }

  throw new Error("DATABASE_SSL must be a boolean flag (1/0, true/false, yes/no, on/off).");
}

export function buildPgSslPoolConfig(
  config: RuntimeDatabaseSslConfig,
): { ssl?: { rejectUnauthorized: true } } {
  return config.enabled
    ? { ssl: { rejectUnauthorized: config.rejectUnauthorized } }
    : {};
}

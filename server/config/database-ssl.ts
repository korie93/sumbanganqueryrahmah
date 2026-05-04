import fs from "node:fs";
import path from "node:path";

export type RuntimeDatabaseSslConfig = {
  enabled: boolean;
  ca?: string;
  rejectUnauthorized: true;
};

const BOOLEAN_TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const BOOLEAN_FALSE_VALUES = new Set(["0", "false", "no", "off"]);

export function resolveDatabaseSslConfig(
  rawValue: string | null,
  params: {
    ca?: string | null;
    caFile?: string | null;
    isProductionLike: boolean;
  },
): RuntimeDatabaseSslConfig {
  const normalized = String(rawValue || "").trim().toLowerCase();
  const ca = resolveDatabaseSslCa(params);

  if (!normalized) {
    return withOptionalCa({
      enabled: params.isProductionLike,
      rejectUnauthorized: true,
    }, ca);
  }

  if (BOOLEAN_TRUE_VALUES.has(normalized)) {
    return withOptionalCa({
      enabled: true,
      rejectUnauthorized: true,
    }, ca);
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
): { ssl?: { ca?: string; rejectUnauthorized: true } } {
  return config.enabled
    ? { ssl: withOptionalCa({ rejectUnauthorized: config.rejectUnauthorized }, config.ca) }
    : {};
}

function resolveDatabaseSslCa(params: {
  ca?: string | null;
  caFile?: string | null;
}): string | undefined {
  const inlineCa = String(params.ca || "").trim();
  if (inlineCa) {
    return inlineCa;
  }

  const caFile = String(params.caFile || "").trim();
  if (!caFile) {
    return undefined;
  }

  const resolvedCaFile = path.resolve(process.cwd(), caFile);
  try {
    const fileCa = fs.readFileSync(resolvedCaFile, "utf8").trim();
    if (!fileCa) {
      throw new Error("file is empty");
    }
    return fileCa;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`DATABASE_SSL_CA_FILE could not be read as a non-empty PEM certificate: ${reason}`);
  }
}

function withOptionalCa<TConfig extends object>(config: TConfig, ca: string | undefined): TConfig & { ca?: string } {
  return ca ? { ...config, ca } : config;
}

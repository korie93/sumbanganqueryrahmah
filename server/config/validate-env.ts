type ProductionEnv = NodeJS.ProcessEnv | Readonly<Record<string, string | undefined>>;

interface RequiredProductionEnvGroup {
  readonly label: string;
  readonly names: readonly string[];
}

const REQUIRED_PRODUCTION_ENV_GROUPS: readonly RequiredProductionEnvGroup[] = [
  {
    label: "SESSION_JWT_PRIVATE_KEY",
    names: ["SESSION_JWT_PRIVATE_KEY"],
  },
  {
    label: "SESSION_JWT_PUBLIC_KEY",
    names: ["SESSION_JWT_PUBLIC_KEY"],
  },
  {
    label: "BACKUP_ENCRYPTION_KEY or BACKUP_ENCRYPTION_KEYS",
    names: ["BACKUP_ENCRYPTION_KEY", "BACKUP_ENCRYPTION_KEYS"],
  },
  {
    label: "COLLECTION_PII_ENCRYPTION_KEY",
    names: ["COLLECTION_PII_ENCRYPTION_KEY"],
  },
  {
    label: "TWO_FACTOR_ENCRYPTION_KEY",
    names: ["TWO_FACTOR_ENCRYPTION_KEY"],
  },
] as const;

function hasConfiguredValue(env: ProductionEnv, name: string): boolean {
  return Boolean(String(env[name] || "").trim());
}

export function getMissingProductionEnvironmentVariables(env: ProductionEnv = process.env): string[] {
  if (env.NODE_ENV !== "production") {
    return [];
  }

  return REQUIRED_PRODUCTION_ENV_GROUPS
    .filter((group) => !group.names.some((name) => hasConfiguredValue(env, name)))
    .map((group) => group.label);
}

export function validateProductionConfig(env: ProductionEnv = process.env): void {
  const missing = getMissingProductionEnvironmentVariables(env);
  if (missing.length === 0) {
    return;
  }

  throw new Error([
    "FATAL: Missing required production environment variables:",
    ...missing.map((name) => `- ${name}`),
    "Server will not start without these. See .env.example for guidance.",
  ].join("\n"));
}

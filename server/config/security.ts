import { randomBytes } from "node:crypto";

const isProduction = process.env.NODE_ENV === "production";

let cachedSessionSecret: string | null = null;
let cachedCollectionNicknameTempPassword: string | null = null;

function readEnv(name: string): string | null {
  const value = process.env[name];
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized : null;
}

function buildEphemeralSecret(label: string): string {
  return `${label.toLowerCase()}-${randomBytes(32).toString("hex")}`;
}

export function getSessionSecret(): string {
  if (cachedSessionSecret) return cachedSessionSecret;

  const secret = readEnv("SESSION_SECRET");
  if (secret) {
    cachedSessionSecret = secret;
    return secret;
  }

  if (isProduction) {
    throw new Error("SESSION_SECRET is required in production.");
  }

  cachedSessionSecret = buildEphemeralSecret("session");
  return cachedSessionSecret;
}

export function getCollectionNicknameTempPassword(): string {
  if (cachedCollectionNicknameTempPassword) {
    return cachedCollectionNicknameTempPassword;
  }

  const password = readEnv("COLLECTION_NICKNAME_TEMP_PASSWORD");
  if (password) {
    cachedCollectionNicknameTempPassword = password;
    return password;
  }

  if (isProduction) {
    throw new Error("COLLECTION_NICKNAME_TEMP_PASSWORD is required in production.");
  }

  cachedCollectionNicknameTempPassword = buildEphemeralSecret("collection-temp").slice(0, 16);
  return cachedCollectionNicknameTempPassword;
}

export function shouldSeedDefaultUsers(): boolean {
  return String(process.env.SEED_DEFAULT_USERS || "0") === "1";
}

export function readDatabasePassword(): string | undefined {
  const password = readEnv("PG_PASSWORD");
  if (password) return password;
  if (isProduction) {
    throw new Error("PG_PASSWORD is required in production.");
  }
  return undefined;
}

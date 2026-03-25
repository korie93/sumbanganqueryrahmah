import { runtimeConfig } from "./runtime";

export function getSessionSecret(): string {
  return runtimeConfig.auth.sessionSecret;
}

export function getCollectionNicknameTempPassword(): string {
  return runtimeConfig.auth.collectionNicknameTempPassword;
}

export function getTwoFactorEncryptionSecret(): string {
  const configured = String(process.env.TWO_FACTOR_ENCRYPTION_KEY || "").trim();
  return configured || runtimeConfig.auth.sessionSecret;
}

export function shouldSeedDefaultUsers(): boolean {
  return runtimeConfig.auth.seedDefaultUsers;
}

export function readDatabasePassword(): string | undefined {
  return runtimeConfig.database.password || undefined;
}

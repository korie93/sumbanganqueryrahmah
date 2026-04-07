import { runtimeConfig } from "./runtime";

export function getSessionSecret(): string {
  return runtimeConfig.auth.sessionSecret;
}

export function getCollectionNicknameTempPassword(): string {
  return runtimeConfig.auth.collectionNicknameTempPassword;
}

export function getTwoFactorEncryptionSecret(): string | null {
  const configured = String(process.env.TWO_FACTOR_ENCRYPTION_KEY || "").trim();
  return configured || null;
}

export function getTwoFactorDecryptionSecrets(): string[] {
  const secrets = new Set<string>();
  const configured = getTwoFactorEncryptionSecret();
  if (configured) {
    secrets.add(configured);
  }
  return Array.from(secrets);
}

export function shouldSeedDefaultUsers(): boolean {
  return runtimeConfig.auth.seedDefaultUsers;
}

export function readDatabasePassword(): string | undefined {
  return runtimeConfig.database.password || undefined;
}

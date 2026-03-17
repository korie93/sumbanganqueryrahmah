import { runtimeConfig } from "./runtime";

export function getSessionSecret(): string {
  return runtimeConfig.auth.sessionSecret;
}

export function getCollectionNicknameTempPassword(): string {
  return runtimeConfig.auth.collectionNicknameTempPassword;
}

export function shouldSeedDefaultUsers(): boolean {
  return runtimeConfig.auth.seedDefaultUsers;
}

export function readDatabasePassword(): string | undefined {
  return runtimeConfig.database.password || undefined;
}

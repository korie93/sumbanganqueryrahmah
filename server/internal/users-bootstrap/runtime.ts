import {
  isStrictLocalDevelopmentEnvironment,
  readBooleanEnvFlag,
} from "../../config/runtime-environment";

export function readUsersBootstrapBooleanFlag(name: string, fallback = false): boolean {
  return readBooleanEnvFlag(name, fallback);
}

export function isUsersBootstrapStrictLocalDevelopmentEnvironment(): boolean {
  return isStrictLocalDevelopmentEnvironment();
}

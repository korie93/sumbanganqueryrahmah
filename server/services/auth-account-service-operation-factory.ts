import { AuthAccountAuthenticationOperations } from "./auth-account-authentication-operations";
import { AuthAccountDevMailOperations } from "./auth-account-dev-mail-operations";
import { AuthAccountManagedOperations } from "./auth-account-managed-operations";
import { AuthAccountRecoveryOperations } from "./auth-account-recovery-operations";
import { AuthAccountSelfOperations } from "./auth-account-self-operations";
import { createAuthAccountServicePolicies } from "./auth-account-service-policies";
import type { AuthAccountStorage } from "./auth-account-service-shared";

export function createAuthAccountServiceOperations(storage: AuthAccountStorage) {
  const policyHelpers = createAuthAccountServicePolicies(storage);
  const authenticationOperations = new AuthAccountAuthenticationOperations({
    storage,
  });
  const invalidateUserSessions = (username: string, reason: string) =>
    authenticationOperations.invalidateUserSessions(username, reason);
  const recoveryOperations = new AuthAccountRecoveryOperations({
    storage,
    invalidateUserSessions,
    requireManagedEmail: policyHelpers.requireManagedEmail,
  });
  const managedOperations = new AuthAccountManagedOperations({
    storage,
    ensureUniqueIdentity: policyHelpers.ensureUniqueIdentity,
    invalidateUserSessions,
    requireManageableTarget: policyHelpers.requireManageableTarget,
    requireManagedEmail: policyHelpers.requireManagedEmail,
    requireSuperuser: policyHelpers.requireSuperuser,
    sendActivationEmail: recoveryOperations.sendActivationEmail.bind(recoveryOperations),
    sendPasswordResetEmail: recoveryOperations.sendPasswordResetEmail.bind(recoveryOperations),
    validateEmail: policyHelpers.validateEmail,
    validateUsername: policyHelpers.validateUsername,
  });
  const devMailOperations = new AuthAccountDevMailOperations({
    storage,
    requireSuperuser: policyHelpers.requireSuperuser,
  });
  const selfOperations = new AuthAccountSelfOperations({
    storage,
    ensureUniqueIdentity: policyHelpers.ensureUniqueIdentity,
    requireActor: policyHelpers.requireActor,
    validateUsername: policyHelpers.validateUsername,
  });

  return {
    authenticationOperations,
    devMailOperations,
    managedOperations,
    recoveryOperations,
    selfOperations,
  };
}

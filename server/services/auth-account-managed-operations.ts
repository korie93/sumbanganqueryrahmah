import type { AuthenticatedUser } from "../auth/guards";
import { AuthAccountManagedLifecycleOperations } from "./auth-account-managed-lifecycle-operations";
import { AuthAccountManagedRecoveryOperations } from "./auth-account-managed-recovery-operations";
import type {
  AuthAccountManagedOpsDeps,
  CreateManagedUserInput,
  UpdateManagedStatusInput,
  UpdateManagedUserInput,
} from "./auth-account-managed-shared";

export type {
  CreateManagedUserInput,
  UpdateManagedStatusInput,
  UpdateManagedUserInput,
} from "./auth-account-managed-shared";

export class AuthAccountManagedOperations {
  private readonly lifecycleOperations: AuthAccountManagedLifecycleOperations;
  private readonly recoveryOperations: AuthAccountManagedRecoveryOperations;

  constructor(deps: AuthAccountManagedOpsDeps) {
    this.lifecycleOperations = new AuthAccountManagedLifecycleOperations(deps);
    this.recoveryOperations = new AuthAccountManagedRecoveryOperations(deps);
  }

  async getManagedUsers(
    authUser: AuthenticatedUser | undefined,
    query: Record<string, unknown> = {},
  ) {
    return this.lifecycleOperations.getManagedUsers(authUser, query);
  }

  async getAccounts(authUser: AuthenticatedUser | undefined) {
    return this.lifecycleOperations.getAccounts(authUser);
  }

  async deleteManagedUser(authUser: AuthenticatedUser | undefined, targetUserId: string) {
    return this.lifecycleOperations.deleteManagedUser(authUser, targetUserId);
  }

  async createManagedUser(authUser: AuthenticatedUser | undefined, input: CreateManagedUserInput) {
    return this.lifecycleOperations.createManagedUser(authUser, input);
  }

  async updateManagedUser(
    authUser: AuthenticatedUser | undefined,
    targetUserId: string,
    input: UpdateManagedUserInput,
  ) {
    return this.lifecycleOperations.updateManagedUser(authUser, targetUserId, input);
  }

  async updateManagedUserRole(
    authUser: AuthenticatedUser | undefined,
    targetUserId: string,
    nextRoleRaw: string,
  ) {
    return this.lifecycleOperations.updateManagedUserRole(
      authUser,
      targetUserId,
      nextRoleRaw,
    );
  }

  async updateManagedUserStatus(
    authUser: AuthenticatedUser | undefined,
    targetUserId: string,
    input: UpdateManagedStatusInput,
  ) {
    return this.lifecycleOperations.updateManagedUserStatus(authUser, targetUserId, input);
  }

  async resendActivation(authUser: AuthenticatedUser | undefined, targetUserId: string) {
    return this.recoveryOperations.resendActivation(authUser, targetUserId);
  }

  async listPendingPasswordResetRequests(
    authUser: AuthenticatedUser | undefined,
    query: Record<string, unknown> = {},
  ) {
    return this.recoveryOperations.listPendingPasswordResetRequests(authUser, query);
  }

  async resetManagedUserPassword(authUser: AuthenticatedUser | undefined, targetUserId: string) {
    return this.recoveryOperations.resetManagedUserPassword(authUser, targetUserId);
  }
}

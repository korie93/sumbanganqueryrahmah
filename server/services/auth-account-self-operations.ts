import type { AuthenticatedUser } from "../auth/guards";
import type { PostgresStorage } from "../storage-postgres";
import {
  AuthAccountSelfCredentialOperations,
  type ChangePasswordInput,
  type UpdateOwnCredentialsInput,
} from "./auth-account-self-credential-operations";
import {
  AuthAccountSelfTwoFactorOperations,
  type ConfirmTwoFactorSetupInput,
  type DisableTwoFactorInput,
  type StartTwoFactorSetupInput,
} from "./auth-account-self-two-factor-operations";

export type {
  ChangePasswordInput,
  UpdateOwnCredentialsInput,
} from "./auth-account-self-credential-operations";
export type {
  ConfirmTwoFactorSetupInput,
  DisableTwoFactorInput,
  StartTwoFactorSetupInput,
} from "./auth-account-self-two-factor-operations";

type AuthAccountUser = NonNullable<Awaited<ReturnType<PostgresStorage["getUser"]>>>;

type AuthAccountSelfStorage = Pick<
  PostgresStorage,
  | "createAuditLog"
  | "deactivateUserActivities"
  | "getActiveActivitiesByUsername"
  | "updateUserAccount"
  | "updateActivitiesUsername"
  | "updateUserCredentials"
>;

type AuthAccountSelfDeps = {
  storage: AuthAccountSelfStorage;
  ensureUniqueIdentity: (params: {
    username?: string;
    email?: string | null;
    ignoreUserId?: string;
  }) => Promise<void>;
  requireActor: (authUser: AuthenticatedUser | undefined) => Promise<AuthAccountUser>;
  validateUsername: (username: string) => void;
};

export class AuthAccountSelfOperations {
  private readonly credentialOperations: AuthAccountSelfCredentialOperations;
  private readonly twoFactorOperations: AuthAccountSelfTwoFactorOperations;

  constructor(private readonly deps: AuthAccountSelfDeps) {
    this.credentialOperations = new AuthAccountSelfCredentialOperations({
      storage: this.deps.storage,
      ensureUniqueIdentity: this.deps.ensureUniqueIdentity,
      validateUsername: this.deps.validateUsername,
    });
    this.twoFactorOperations = new AuthAccountSelfTwoFactorOperations({
      storage: this.deps.storage,
    });
  }

  async changeOwnPassword(authUser: AuthenticatedUser | undefined, input: ChangePasswordInput) {
    const actor = await this.deps.requireActor(authUser);
    return this.credentialOperations.changeOwnPassword(actor, input);
  }

  async changeOwnUsername(authUser: AuthenticatedUser | undefined, newUsernameRaw: string) {
    const actor = await this.deps.requireActor(authUser);
    return this.credentialOperations.changeOwnUsername(actor, newUsernameRaw);
  }

  async getCurrentUser(authUser: AuthenticatedUser | undefined) {
    return this.deps.requireActor(authUser);
  }

  async startTwoFactorSetup(
    authUser: AuthenticatedUser | undefined,
    input: StartTwoFactorSetupInput,
  ) {
    const actor = await this.deps.requireActor(authUser);
    return this.twoFactorOperations.startTwoFactorSetup(actor, input);
  }

  async confirmTwoFactorSetup(
    authUser: AuthenticatedUser | undefined,
    input: ConfirmTwoFactorSetupInput,
  ) {
    const actor = await this.deps.requireActor(authUser);
    return this.twoFactorOperations.confirmTwoFactorSetup(actor, input);
  }

  async disableTwoFactor(
    authUser: AuthenticatedUser | undefined,
    input: DisableTwoFactorInput,
  ) {
    const actor = await this.deps.requireActor(authUser);
    return this.twoFactorOperations.disableTwoFactor(actor, input);
  }

  async updateOwnCredentials(
    authUser: AuthenticatedUser | undefined,
    input: UpdateOwnCredentialsInput,
  ) {
    const actor = await this.deps.requireActor(authUser);
    return this.credentialOperations.updateOwnCredentials(actor, input);
  }
}

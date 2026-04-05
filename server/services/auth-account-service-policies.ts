import type { AuthenticatedUser } from "../auth/guards";
import {
  CREDENTIAL_EMAIL_REGEX,
  CREDENTIAL_USERNAME_REGEX,
  normalizeEmailInput,
} from "../auth/credentials";
import { isManageableUserRole } from "../auth/account-lifecycle";
import type { PostgresStorage } from "../storage-postgres";
import { AuthAccountError } from "./auth-account-types";

type AuthAccountPolicyStorage = Pick<
  PostgresStorage,
  "getUser" | "getUserByEmail" | "getUserByUsername"
>;

type EnsureUniqueIdentityInput = {
  username?: string;
  email?: string | null;
  ignoreUserId?: string;
};

export function createAuthAccountServicePolicies(storage: AuthAccountPolicyStorage) {
  const validateEmail = (email: string | null) => {
    if (!email) return;
    if (!CREDENTIAL_EMAIL_REGEX.test(email)) {
      throw new AuthAccountError(400, "INVALID_EMAIL", "Email address is invalid.");
    }
  };

  const requireManagedEmail = (email: string | null, message: string) => {
    const normalizedEmail = normalizeEmailInput(email);
    if (!normalizedEmail) {
      throw new AuthAccountError(400, "INVALID_EMAIL", message);
    }

    validateEmail(normalizedEmail);
    return normalizedEmail;
  };

  const requireActor = async (authUser: AuthenticatedUser | undefined) => {
    if (!authUser) {
      throw new AuthAccountError(401, "PERMISSION_DENIED", "Authentication required.");
    }

    const actor = authUser.userId
      ? await storage.getUser(authUser.userId)
      : await storage.getUserByUsername(authUser.username);

    if (!actor) {
      throw new AuthAccountError(404, "USER_NOT_FOUND", "User not found.");
    }

    return actor;
  };

  const requireSuperuser = async (authUser: AuthenticatedUser | undefined) => {
    const actor = await requireActor(authUser);
    if (actor.role !== "superuser") {
      throw new AuthAccountError(403, "PERMISSION_DENIED", "Only superuser can access this resource.");
    }
    return actor;
  };

  const requireManageableTarget = async (userId: string) => {
    const normalizedId = String(userId || "").trim();
    if (!normalizedId) {
      throw new AuthAccountError(404, "USER_NOT_FOUND", "Target user not found.");
    }

    const target = await storage.getUser(normalizedId);
    if (!target) {
      throw new AuthAccountError(404, "USER_NOT_FOUND", "Target user not found.");
    }

    if (!isManageableUserRole(target.role)) {
      throw new AuthAccountError(403, "PERMISSION_DENIED", "Target role is not allowed.");
    }

    return target;
  };

  const validateUsername = (username: string) => {
    if (!CREDENTIAL_USERNAME_REGEX.test(username)) {
      throw new AuthAccountError(
        400,
        "USERNAME_TAKEN",
        "Username must match ^[a-zA-Z0-9._-]{3,32}$.",
      );
    }
  };

  const ensureUniqueIdentity = async (params: EnsureUniqueIdentityInput) => {
    if (params.username) {
      const existingByUsername = await storage.getUserByUsername(params.username);
      if (existingByUsername && existingByUsername.id !== params.ignoreUserId) {
        throw new AuthAccountError(409, "USERNAME_TAKEN", "Username already exists.");
      }
    }

    if (params.email) {
      const existingByEmail = await storage.getUserByEmail(params.email);
      if (existingByEmail && existingByEmail.id !== params.ignoreUserId) {
        throw new AuthAccountError(409, "INVALID_EMAIL", "Email already exists.");
      }
    }
  };

  return {
    ensureUniqueIdentity,
    requireActor,
    requireManagedEmail,
    requireManageableTarget,
    requireSuperuser,
    validateEmail,
    validateUsername,
  };
}

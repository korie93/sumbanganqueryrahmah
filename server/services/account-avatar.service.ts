import type { AuthenticatedUser } from "../auth/guards";
import { z } from "zod";
import { ERROR_CODES } from "../../shared/error-codes";
import { parseRequestBody } from "../http/validation";
import { AuthAccountError } from "./auth-account-types";
import { inspectStoredAvatar, validateAccountAvatarUpload } from "../lib/account-avatar-image";
import { logger } from "../lib/logger";
import type { PostgresStorage } from "../storage-postgres";
import type { AuthAccountService } from "./auth-account.service";
import type { AccountAvatarRepository } from "../repositories/account-avatar.repository";

type Account = NonNullable<Awaited<ReturnType<AuthAccountService["getCurrentUser"]>>>;

export class AccountAvatarService {
  constructor(private readonly deps: {
    authAccountService: Pick<AuthAccountService, "getCurrentUser">;
    repository: Pick<AccountAvatarRepository, "getUrl" | "read" | "save" | "remove">;
    storage: Pick<PostgresStorage, "createAuditLog">;
  }) {}

  private async requireActor(authUser: AuthenticatedUser | undefined) {
    const actor = await this.deps.authAccountService.getCurrentUser(authUser);
    if (actor.isBanned || actor.status !== "active") {
      throw new AuthAccountError(403, ERROR_CODES.PERMISSION_DENIED, "This account is not available.");
    }
    if (actor.mustChangePassword) {
      throw new AuthAccountError(403, ERROR_CODES.PASSWORD_CHANGE_REQUIRED, "Change your password before updating your account.");
    }
    return actor;
  }

  async getAvatarUrl(actor: Account): Promise<string | null> {
    // A missing/unavailable optional photo must never prevent authentication.
    if (actor.mustChangePassword) return null;
    try { return await this.deps.repository.getUrl(actor.id); }
    catch (error) {
      logger.warn("Account photo metadata unavailable", { errorName: error instanceof Error ? error.name : "UnknownError" });
      return null;
    }
  }

  async read(authUser: AuthenticatedUser | undefined) {
    const actor = await this.requireActor(authUser);
    const buffer = await this.deps.repository.read(actor.id);
    if (!buffer) throw new AuthAccountError(404, ERROR_CODES.NOT_FOUND, "No profile picture has been saved.");
    return { buffer, mimeType: inspectStoredAvatar(buffer).mimeType };
  }

  async update(authUser: AuthenticatedUser | undefined, body: unknown) {
    const actor = await this.requireActor(authUser);
    const image = validateAccountAvatarUpload(body);
    await this.deps.repository.save(actor.id, image.buffer);
    await this.deps.storage.createAuditLog({
      action: "USER_PROFILE_PICTURE_UPDATED",
      performedBy: actor.id,
      targetUser: actor.id,
      details: JSON.stringify({ mimeType: image.mimeType, bytes: image.buffer.length }),
    });
    return actor;
  }

  async remove(authUser: AuthenticatedUser | undefined, body: unknown) {
    const actor = await this.requireActor(authUser);
    parseRequestBody(z.object({}).strict().optional(), body);
    const removed = await this.deps.repository.remove(actor.id);
    if (removed) {
      await this.deps.storage.createAuditLog({
        action: "USER_PROFILE_PICTURE_REMOVED",
        performedBy: actor.id,
        targetUser: actor.id,
        details: JSON.stringify({ removed: true }),
      });
    }
    return actor;
  }
}

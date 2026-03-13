import { badRequest, notFound } from "../../http/errors";
import {
  ensureLooseObject,
  normalizeCollectionStringList,
  normalizeCollectionText,
  type CollectionAdminGroupPayload,
  type CollectionNicknameAssignmentPayload,
} from "../../routes/collection.validation";
import { CollectionServiceSupport } from "./collection-service-support";

export class CollectionAdminService extends CollectionServiceSupport {
  async listAdmins() {
    const admins = await this.storage.getCollectionAdminUsers();
    return { ok: true as const, admins };
  }

  async listAdminGroups() {
    const groups = await this.storage.getCollectionAdminGroups();
    return { ok: true as const, groups };
  }

  async createAdminGroup(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], bodyRaw: unknown) {
    const user = this.requireUser(userInput);
    const body = (ensureLooseObject(bodyRaw) || {}) as CollectionAdminGroupPayload;
    const leaderNicknameId = normalizeCollectionText(body.leaderNicknameId);
    if (!leaderNicknameId) {
      throw badRequest("leaderNicknameId is required.");
    }
    const memberNicknameIds = Array.isArray(body.memberNicknameIds)
      ? normalizeCollectionStringList(body.memberNicknameIds as unknown[])
      : [];

    try {
      const group = await this.storage.createCollectionAdminGroup({
        leaderNicknameId,
        memberNicknameIds,
        createdBy: user.username,
      });

      await this.storage.createAuditLog({
        action: "COLLECTION_ADMIN_GROUP_CREATED",
        performedBy: user.username,
        targetResource: group.id,
        details: `Admin group created for leader ${group.leaderNickname}. members=${group.memberNicknames.length}`,
      });

      return { ok: true as const, group };
    } catch (err) {
      this.throwAdminGroupError(err);
    }
  }

  async updateAdminGroup(
    userInput: Parameters<CollectionServiceSupport["requireUser"]>[0],
    groupIdRaw: unknown,
    bodyRaw: unknown,
  ) {
    const user = this.requireUser(userInput);
    const groupId = normalizeCollectionText(groupIdRaw);
    if (!groupId) {
      throw badRequest("groupId is required.");
    }

    const body = (ensureLooseObject(bodyRaw) || {}) as CollectionAdminGroupPayload;
    const hasLeader = Object.prototype.hasOwnProperty.call(body, "leaderNicknameId");
    const hasMembers = Object.prototype.hasOwnProperty.call(body, "memberNicknameIds");
    if (!hasLeader && !hasMembers) {
      throw badRequest("No admin group update payload provided.");
    }

    const leaderNicknameId = hasLeader ? normalizeCollectionText(body.leaderNicknameId) : undefined;
    if (hasLeader && !leaderNicknameId) {
      throw badRequest("leaderNicknameId is required.");
    }
    const memberNicknameIds = hasMembers
      ? (Array.isArray(body.memberNicknameIds)
        ? normalizeCollectionStringList(body.memberNicknameIds as unknown[])
        : [])
      : undefined;

    try {
      const group = await this.storage.updateCollectionAdminGroup({
        groupId,
        leaderNicknameId,
        memberNicknameIds,
        updatedBy: user.username,
      });

      if (!group) {
        throw notFound("Admin group not found.");
      }

      await this.storage.createAuditLog({
        action: "COLLECTION_ADMIN_GROUP_UPDATED",
        performedBy: user.username,
        targetResource: group.id,
        details: `Admin group updated for leader ${group.leaderNickname}. members=${group.memberNicknames.length}`,
      });

      return { ok: true as const, group };
    } catch (err) {
      this.throwAdminGroupError(err);
    }
  }

  async deleteAdminGroup(userInput: Parameters<CollectionServiceSupport["requireUser"]>[0], groupIdRaw: unknown) {
    const user = this.requireUser(userInput);
    const groupId = normalizeCollectionText(groupIdRaw);
    if (!groupId) {
      throw badRequest("groupId is required.");
    }

    const deleted = await this.storage.deleteCollectionAdminGroup(groupId);
    if (!deleted) {
      throw notFound("Admin group not found.");
    }

    await this.storage.createAuditLog({
      action: "COLLECTION_ADMIN_GROUP_DELETED",
      performedBy: user.username,
      targetResource: groupId,
      details: "Admin group deleted.",
    });

    return { ok: true as const };
  }

  async getNicknameAssignments(adminIdRaw: unknown) {
    const adminId = normalizeCollectionText(adminIdRaw);
    if (!adminId) {
      throw badRequest("Admin id is required.");
    }

    const admin = await this.storage.getCollectionAdminUserById(adminId);
    if (!admin) {
      throw notFound("Admin not found.");
    }

    const nicknameIds = await this.storage.getCollectionAdminAssignedNicknameIds(adminId);
    return { ok: true as const, admin, nicknameIds };
  }

  async setNicknameAssignments(
    userInput: Parameters<CollectionServiceSupport["requireUser"]>[0],
    adminIdRaw: unknown,
    bodyRaw: unknown,
  ) {
    const user = this.requireUser(userInput);
    const adminId = normalizeCollectionText(adminIdRaw);
    if (!adminId) {
      throw badRequest("Admin id is required.");
    }

    const body = (ensureLooseObject(bodyRaw) || {}) as CollectionNicknameAssignmentPayload;
    if (!Array.isArray(body.nicknameIds)) {
      throw badRequest("nicknameIds must be an array.");
    }
    const nicknameIds = normalizeCollectionStringList(body.nicknameIds);

    try {
      const assignedNicknameIds = await this.storage.setCollectionAdminAssignedNicknameIds({
        adminUserId: adminId,
        nicknameIds,
        createdBySuperuser: user.username,
      });

      await this.storage.createAuditLog({
        action: "COLLECTION_NICKNAME_ASSIGNMENTS_UPDATED",
        performedBy: user.username,
        targetResource: adminId,
        details: `Updated admin nickname assignments. total=${assignedNicknameIds.length}`,
      });

      return {
        ok: true as const,
        adminId,
        nicknameIds: assignedNicknameIds,
      };
    } catch (err) {
      this.throwNicknameAssignmentError(err);
    }
  }
}

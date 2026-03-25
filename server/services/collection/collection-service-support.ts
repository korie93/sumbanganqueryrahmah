import { badRequest, conflict, forbidden, notFound, unauthorized } from "../../http/errors";
import type { AuthenticatedUser } from "../../auth/guards";
import type { CollectionNicknameAuthProfile, PostgresStorage } from "../../storage-postgres";
import { resolveCollectionNicknameAccessForUser } from "../../routes/collection-access";
import { COLLECTION_SUMMARY_MONTH_NAMES } from "../../routes/collection.validation";

export type SummaryQuery = Record<string, unknown>;
export type ListQuery = Record<string, unknown>;

export type CollectionStoragePort = Pick<
  PostgresStorage,
  | "createAuditLog"
  | "createCollectionAdminGroup"
  | "createCollectionRecord"
  | "createCollectionRecordReceipts"
  | "createCollectionStaffNickname"
  | "deleteAllCollectionRecordReceipts"
  | "deleteCollectionAdminGroup"
  | "deleteCollectionRecord"
  | "deleteCollectionRecordReceipts"
  | "deleteCollectionStaffNickname"
  | "getCollectionAdminAssignedNicknameIds"
  | "getCollectionAdminGroupVisibleNicknameValuesByLeader"
  | "getCollectionAdminGroups"
  | "getCollectionAdminUserById"
  | "getCollectionAdminUsers"
  | "getCollectionMonthlySummary"
  | "getCollectionDailyTarget"
  | "listCollectionDailyCalendar"
  | "listCollectionDailyPaidCustomers"
  | "listCollectionDailyUsers"
  | "getCollectionNicknameAuthProfileByName"
  | "getCollectionNicknameSessionByActivity"
  | "getCollectionRecordById"
  | "getCollectionStaffNicknameById"
  | "getCollectionStaffNicknameByName"
  | "getCollectionStaffNicknames"
  | "getUser"
  | "getUserByUsername"
  | "isCollectionStaffNicknameActive"
  | "listCollectionRecordReceipts"
  | "listCollectionRecords"
  | "purgeCollectionRecordsOlderThan"
  | "setCollectionAdminAssignedNicknameIds"
  | "setCollectionNicknamePassword"
  | "setCollectionNicknameSession"
  | "summarizeCollectionRecords"
  | "summarizeCollectionRecordsByNicknameAndPaymentDate"
  | "summarizeCollectionRecordsByNickname"
  | "summarizeCollectionRecordsOlderThan"
  | "upsertCollectionDailyCalendarDays"
  | "upsertCollectionDailyTarget"
  | "updateCollectionAdminGroup"
  | "updateCollectionRecord"
  | "updateCollectionStaffNickname"
>;

export class CollectionServiceSupport {
  constructor(protected readonly storage: CollectionStoragePort) {}

  protected requireUser(user?: AuthenticatedUser): AuthenticatedUser {
    if (!user) {
      throw unauthorized("Unauthenticated");
    }
    return user;
  }

  protected buildEmptySummary(year: number) {
    return {
      ok: true as const,
      year,
      summary: COLLECTION_SUMMARY_MONTH_NAMES.map((monthName, index) => ({
        month: index + 1,
        monthName,
        totalRecords: 0,
        totalAmount: 0,
      })),
    };
  }

  protected resolveAccessError(status: number, message: string): never {
    if (status === 400) throw badRequest(message);
    if (status === 401) throw unauthorized(message);
    if (status === 403) throw forbidden(message);
    if (status === 404) throw notFound(message);
    if (status === 409) throw conflict(message);
    throw new Error(message);
  }

  protected async requireNicknameAccess(
    user: AuthenticatedUser,
    nicknameRaw: unknown,
  ): Promise<CollectionNicknameAuthProfile> {
    const resolved = await resolveCollectionNicknameAccessForUser(this.storage, user, nicknameRaw);
    if (!resolved.ok) {
      this.resolveAccessError(resolved.status, resolved.message);
    }
    return resolved.profile;
  }

  protected throwAdminGroupError(err: unknown): never {
    const message = String((err as { message?: string })?.message || "");
    const lower = message.toLowerCase();
    if (lower.includes("already assigned")) {
      throw conflict("This nickname is already assigned to another admin group.");
    }
    if (lower.includes("invalid nickname ids") || lower.includes("invalid leader nickname")) {
      throw badRequest("Invalid nickname ids.");
    }
    if (lower.includes("must have admin scope")) {
      throw badRequest("Leader nickname must be admin scope.");
    }
    if (lower.includes("must be active")) {
      throw badRequest("Leader nickname must be active.");
    }
    if (lower.includes("cannot be a member")) {
      throw badRequest("Leader nickname cannot be included as member.");
    }
    throw err;
  }

  protected throwNicknameAssignmentError(err: unknown): never {
    const message = String((err as { message?: string })?.message || "");
    const lower = message.toLowerCase();
    if (lower.includes("admin user not found")) {
      throw notFound("Admin not found.");
    }
    if (lower.includes("invalid nickname ids")) {
      throw badRequest("Invalid nickname ids.");
    }
    throw err;
  }
}

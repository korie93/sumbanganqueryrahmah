import { badRequest, forbidden } from "../../http/errors";
import type { AuthenticatedUser } from "../../auth/guards";
import { verifyPassword } from "../../auth/passwords";
import { removeCollectionReceiptFile } from "../../routes/collection-receipt.service";
import { ensureLooseObject } from "../../routes/collection.validation";
import type { CollectionStoragePort } from "./collection-service-support";
import {
  buildCollectionPurgeCutoffDate,
  getCollectionPurgeRetentionMonths,
} from "./collection-record-runtime-utils";
import { logRejectedCollectionPurgeAttempt } from "./collection-record-mutation-support";

type RequireUserFn = (user?: AuthenticatedUser) => AuthenticatedUser;

export class CollectionRecordPurgeOperations {
  constructor(
    private readonly storage: CollectionStoragePort,
    private readonly requireUser: RequireUserFn,
  ) {}

  async purgeOldRecords(
    userInput: AuthenticatedUser | undefined,
    bodyRaw?: unknown,
  ) {
    const user = this.requireUser(userInput);
    if (user.role !== "superuser") {
      throw forbidden("Purge data collection hanya untuk superuser.");
    }

    const actor =
      (user.userId ? await this.storage.getUser(user.userId) : undefined)
      || (await this.storage.getUserByUsername(user.username));
    if (!actor?.passwordHash) {
      throw forbidden("Tidak dapat sahkan kelayakan superuser.");
    }

    const body = ensureLooseObject(bodyRaw) || {};
    const currentPassword = String(body.currentPassword || "");
    if (!currentPassword) {
      throw badRequest("Password login superuser diperlukan untuk purge.");
    }

    const isValidPassword = await verifyPassword(currentPassword, actor.passwordHash);
    if (!isValidPassword) {
      await logRejectedCollectionPurgeAttempt(
        this.storage,
        user.username,
        `Rejected collection purge attempt due to invalid superuser password by ${user.username}`,
      );
      throw forbidden("Password login superuser tidak sah.");
    }

    const cutoffDate = buildCollectionPurgeCutoffDate();
    const purged = await this.storage.purgeCollectionRecordsOlderThan(cutoffDate);
    if (purged.receiptPaths.length > 0) {
      await Promise.allSettled(
        purged.receiptPaths.map((receiptPath) => removeCollectionReceiptFile(receiptPath)),
      );
    }

    if (purged.totalRecords > 0) {
      await this.storage.createAuditLog({
        action: "COLLECTION_RECORDS_PURGED",
        performedBy: user.username,
        targetResource: "collection-records",
        details: `Purged ${purged.totalRecords} collection records older than ${cutoffDate} by ${user.username}`,
      });
    }

    return {
      ok: true as const,
      retentionMonths: getCollectionPurgeRetentionMonths(),
      cutoffDate,
      deletedRecords: purged.totalRecords,
      totalAmount: purged.totalAmount,
    };
  }
}

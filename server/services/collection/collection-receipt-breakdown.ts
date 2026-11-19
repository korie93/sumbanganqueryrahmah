import type { CollectionReceiptBreakdown } from "../../../shared/collection-receipt-breakdown";
import { formatCollectionAmountFromCents, parseCollectionAmountToCents } from "../../../shared/collection-amount-types";
import type { AuthenticatedUser } from "../../auth/guards";
import { z } from "zod";
import { badRequest, forbidden, notFound } from "../../http/errors";
import { getAccessibleCollectionRecordOrThrow, isCollectionAccessUserSnapshotUsable } from "../../routes/collection-access";
import type { CollectionStoragePort } from "./collection-service-support";

const recordIdSchema = z.guid();

export async function compareSharedReceipt(
  storage: CollectionStoragePort, user: AuthenticatedUser, recordId: string, receiptId: string, relatedRecordId: string,
) {
  if (user.role !== "superuser" || !isCollectionAccessUserSnapshotUsable(user)) throw forbidden();
  if (![recordId, receiptId, relatedRecordId].every(id => recordIdSchema.safeParse(id).success)) {
    throw badRequest("Invalid collection or receipt ID.");
  }
  const pair = await storage.getCollectionReceiptComparison(recordId, receiptId, relatedRecordId);
  if (!pair) throw notFound("Shared receipt match is no longer available.");
  return pair;
}

export async function readCollectionReceiptBreakdown(
  storage: CollectionStoragePort, user: AuthenticatedUser, recordId: string,
): Promise<CollectionReceiptBreakdown> {
  if (!recordIdSchema.safeParse(recordId).success) throw badRequest("Invalid collection record ID.");
  const record = await getAccessibleCollectionRecordOrThrow(storage, user, recordId);
  const receipts = record.receipts.filter(receipt => !receipt.deletedAt);
  const hashes = [...new Set(receipts.flatMap(receipt => receipt.fileHash ? [receipt.fileHash.toLowerCase()] : []))];
  const superuser = user.role === "superuser";
  const matches = hashes.length ? await storage.findCollectionReceiptDuplicateSummaries(hashes, {
    excludeRecordId: record.id, includeRecordDetails: superuser,
  }) : [];
  const byHash = new Map(matches.map(match => [match.fileHash, match]));
  const totals: Record<"shared" | "unique", number | null> = { shared: 0, unique: 0 };
  const sharedReceipts: CollectionReceiptBreakdown["sharedReceipts"] = [];
  let unclassifiedCount = 0;
  for (const receipt of receipts) {
    if (!receipt.fileHash) {
      unclassifiedCount++;
      continue;
    }
    const match = byHash.get(receipt.fileHash.toLowerCase());
    const group = match ? "shared" : "unique";
    const cents = parseCollectionAmountToCents(receipt.receiptAmount, { allowZero: true });
    const prior: number | null = totals[group];
    const next: number | null = prior === null || cents === null ? null : prior + cents;
    totals[group] = Number.isSafeInteger(next) ? next : null;
    if (match) {
      sharedReceipts.push({
        id: receipt.id, fileName: receipt.originalFileName, amount: receipt.receiptAmount,
        ...(superuser ? { related: {
          count: match.matchCount,
          records: match.matches.flatMap(item => item.record ? [item.record] : []),
        } } : {}),
      });
    }
  }
  return {
    ok: true, recordedAmount: record.amount, totalDue: record.totalDue ?? null,
    sharedAmount: totals.shared === null ? null : formatCollectionAmountFromCents(totals.shared),
    uniqueAmount: totals.unique === null ? null : formatCollectionAmountFromCents(totals.unique),
    unclassifiedCount, receiptCount: receipts.length, sharedReceipts,
  };
}

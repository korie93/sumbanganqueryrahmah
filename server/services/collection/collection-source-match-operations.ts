import type { AuthenticatedUser } from "../../auth/guards";
import { badRequest } from "../../http/errors";
import {
  COLLECTION_ACCOUNT_NUMBER_MAX_LENGTH,
  COLLECTION_CUSTOMER_NAME_MAX_LENGTH,
  COLLECTION_IC_NUMBER_MAX_LENGTH,
  COLLECTION_SOURCE_IMPORT_ID_MAX_LENGTH,
  ensureLooseObject,
  isFutureCollectionDate,
  isValidCollectionDate,
  isValidCollectionPhone,
  normalizeCollectionText,
  parseCollectionAmount,
  type CollectionSourceMatchPayload,
} from "../../routes/collection.validation";
import type { CollectionStoragePort } from "./collection-service-support";
import { logger } from "../../lib/logger";
import { formatCollectionAmountMyrString } from "../../../shared/collection-amount-types";
import { isDateInsideCollectionCallingWindow } from "../../lib/collection-calling-window";
import { verifySelectedSavedCollectionSource } from "./collection-source-verification";

type RequireUserFn = (user?: AuthenticatedUser) => AuthenticatedUser;

export class CollectionSourceMatchOperations {
  constructor(
    private readonly storage: CollectionStoragePort,
    private readonly requireUser: RequireUserFn,
  ) {}

  async listSourceFiles(
    userInput: AuthenticatedUser | undefined,
    queryRaw: Record<string, unknown>,
  ) {
    this.requireUser(userInput);
    const search = normalizeCollectionText(queryRaw.search).slice(0, 120);
    const cursor = normalizeCollectionText(queryRaw.cursor).slice(0, 1_024);
    const requestedLimit = Number(queryRaw.limit);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(100, Math.trunc(requestedLimit)))
      : 100;
    const page = await this.storage.listCollectionSavedSourceFiles({
      cursor: cursor || null,
      limit,
      search: search || null,
    });
    return {
      ok: true as const,
      sourceFiles: page.items,
      pagination: {
        limit: page.limit,
        nextCursor: page.nextCursor,
        total: page.total,
      },
    };
  }

  async listMatches(userInput: AuthenticatedUser | undefined, bodyRaw: unknown) {
    const user = this.requireUser(userInput);
    const body = (ensureLooseObject(bodyRaw) || {}) as CollectionSourceMatchPayload;
    const customerName = normalizeCollectionText(body.customerName);
    const icNumber = normalizeCollectionText(body.icNumber);
    const customerPhone = normalizeCollectionText(body.customerPhone);
    const accountNumber = normalizeCollectionText(body.accountNumber);
    const sourceImportId = normalizeCollectionText(body.sourceImportId);
    const paymentDate = normalizeCollectionText(body.paymentDate);
    const amount = parseCollectionAmount(body.amount);

    if (!customerName || customerName.length > COLLECTION_CUSTOMER_NAME_MAX_LENGTH) {
      throw badRequest("Customer Name is required and must not exceed 200 characters.");
    }
    if (!icNumber || icNumber.length > COLLECTION_IC_NUMBER_MAX_LENGTH) {
      throw badRequest("IC Number is required and must not exceed 64 characters.");
    }
    if (!isValidCollectionPhone(customerPhone)) {
      throw badRequest("Customer Phone Number is invalid.");
    }
    if (!accountNumber || accountNumber.length > COLLECTION_ACCOUNT_NUMBER_MAX_LENGTH) {
      throw badRequest("Account Number is required and must not exceed 128 characters.");
    }
    if (!sourceImportId || sourceImportId.length > COLLECTION_SOURCE_IMPORT_ID_MAX_LENGTH) {
      throw badRequest("Select a valid Saved source file.", "COLLECTION_SOURCE_REQUIRED");
    }
    if (!paymentDate || !isValidCollectionDate(paymentDate) || isFutureCollectionDate(paymentDate)) {
      throw badRequest("A valid non-future Payment Date is required for matching.");
    }
    if (amount === null) {
      throw badRequest("A valid positive Amount is required for matching.");
    }

    const match = await verifySelectedSavedCollectionSource(this.storage, {
      customerName,
      icNumber,
      customerPhone,
      accountNumber,
      sourceImportId,
    });
    if (match.totalDue === null) {
      throw badRequest(
        "The matched Saved row does not contain a valid TOTAL DUE value.",
        "COLLECTION_SOURCE_TOTAL_DUE_MISSING",
      );
    }
    if (!isDateInsideCollectionCallingWindow(paymentDate, {
      start: match.callingDate as string,
      endExclusive: match.callingWindowEndExclusive as string,
    })) {
      throw badRequest(
        `Payment Date must be between ${match.callingDate} and ${match.callingWindowEnd}.`,
        "COLLECTION_PAYMENT_OUTSIDE_CALLING_WINDOW",
      );
    }
    const projection = await this.storage.getCollectionSettlementProjection({
      callingDate: match.callingDate as string,
      callingWindowEndExclusive: match.callingWindowEndExclusive as string,
      currentAmount: formatCollectionAmountMyrString(amount),
      paymentDate,
      sourceDataRowId: match.rowId,
      sourceImportId,
      totalDue: match.totalDue,
    });

    try {
      await this.storage.createAuditLog({
        action: "COLLECTION_SOURCE_MATCH_PREVIEW",
        performedBy: user.username,
        targetResource: "collection-records",
        details: JSON.stringify({
          event: "collection_source_match_preview",
          actor: user.username,
          matchCount: 1,
          sourceImportId,
          sourceDataRowId: match.rowId,
        }),
      });
    } catch (error) {
      logger.warn("Collection source match audit logging failed", {
        error,
        username: user.username,
      });
    }

    return {
      ok: true as const,
      matches: [{
        sourceImportId: match.sourceImportId,
        sourceImportName: match.sourceImportName,
        sourceFilename: match.sourceFilename,
        matchBasis: match.matchBasis,
        matchAccuracy: match.matchAccuracy,
        matchedFields: match.matchedFields,
        comparedFields: match.comparedFields,
        totalDue: match.totalDue,
        billingPrincipalOsp: match.billingPrincipalOsp,
        callingDate: match.callingDate,
        callingWindowEnd: match.callingWindowEnd,
        callingWindowEndExclusive: match.callingWindowEndExclusive,
        ...projection,
      }],
    };
  }
}

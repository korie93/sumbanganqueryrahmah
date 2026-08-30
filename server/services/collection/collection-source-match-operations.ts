import type { AuthenticatedUser } from "../../auth/guards";
import { badRequest } from "../../http/errors";
import {
  ensureLooseObject,
  isValidCollectionPhone,
  normalizeCollectionText,
  type CollectionSourceMatchPayload,
} from "../../routes/collection.validation";
import type { CollectionStoragePort } from "./collection-service-support";
import { logger } from "../../lib/logger";

type RequireUserFn = (user?: AuthenticatedUser) => AuthenticatedUser;

const MAX_CUSTOMER_NAME_LENGTH = 200;
const MAX_IC_NUMBER_LENGTH = 64;
const MAX_ACCOUNT_NUMBER_LENGTH = 128;

export class CollectionSourceMatchOperations {
  constructor(
    private readonly storage: CollectionStoragePort,
    private readonly requireUser: RequireUserFn,
  ) {}

  async listMatches(userInput: AuthenticatedUser | undefined, bodyRaw: unknown) {
    const user = this.requireUser(userInput);
    const body = (ensureLooseObject(bodyRaw) || {}) as CollectionSourceMatchPayload;
    const customerName = normalizeCollectionText(body.customerName);
    const icNumber = normalizeCollectionText(body.icNumber);
    const customerPhone = normalizeCollectionText(body.customerPhone);
    const accountNumber = normalizeCollectionText(body.accountNumber);

    if (!customerName || customerName.length > MAX_CUSTOMER_NAME_LENGTH) {
      throw badRequest("Customer Name is required and must not exceed 200 characters.");
    }
    if (!icNumber || icNumber.length > MAX_IC_NUMBER_LENGTH) {
      throw badRequest("IC Number is required and must not exceed 64 characters.");
    }
    if (!isValidCollectionPhone(customerPhone)) {
      throw badRequest("Customer Phone Number is invalid.");
    }
    if (!accountNumber || accountNumber.length > MAX_ACCOUNT_NUMBER_LENGTH) {
      throw badRequest("Account Number is required and must not exceed 128 characters.");
    }

    const matches = await this.storage.findSavedCollectionSourcesForRecord({
      customerName,
      icNumber,
      customerPhone,
      accountNumber,
    });

    try {
      await this.storage.createAuditLog({
        action: "COLLECTION_SOURCE_MATCH_PREVIEW",
        performedBy: user.username,
        targetResource: "collection-records",
        details: JSON.stringify({
          event: "collection_source_match_preview",
          actor: user.username,
          matchCount: matches.length,
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
      matches: matches.map((match) => ({
        sourceImportId: match.sourceImportId,
        sourceImportName: match.sourceImportName,
        sourceFilename: match.sourceFilename,
        matchBasis: match.matchBasis,
        matchAccuracy: match.matchAccuracy,
        matchedFields: match.matchedFields,
        comparedFields: match.comparedFields,
        totalDue: match.totalDue,
        billingPrincipalOsp: match.billingPrincipalOsp,
      })),
    };
  }
}

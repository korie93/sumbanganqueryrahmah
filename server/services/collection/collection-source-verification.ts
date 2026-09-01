import { badRequest, notFound } from "../../http/errors";
import type { SavedCollectionSourceLookup, SavedCollectionSourceMatch } from "../../repositories/search-repository-types";
import type { CollectionStoragePort } from "./collection-service-support";
import type { CollectionIndexedSourceMatch } from "../../storage-postgres-collection-types";

function buildIdentityRankSignature(match: SavedCollectionSourceMatch): string {
  return JSON.stringify({
    basis: match.matchBasis,
    accuracy: match.matchAccuracy,
    matchedFields: [...match.matchedFields].sort(),
  });
}

export async function verifySelectedSavedCollectionSource(
  storage: Pick<
    CollectionStoragePort,
    "findSavedCollectionSourcesForRecord" | "getImportById"
  >,
  lookup: SavedCollectionSourceLookup & { sourceImportId: string },
): Promise<SavedCollectionSourceMatch> {
  const sourceImportId = String(lookup.sourceImportId || "").trim();
  if (!sourceImportId) {
    throw badRequest("Select a Saved source file before matching.", "COLLECTION_SOURCE_REQUIRED");
  }

  const sourceFile = await storage.getImportById(sourceImportId);
  if (!sourceFile) {
    throw notFound(
      "The selected Saved source file is unavailable. Refresh the source list.",
      "COLLECTION_SOURCE_FILE_NOT_FOUND",
    );
  }

  const matches = await storage.findSavedCollectionSourcesForRecord({
    ...lookup,
    sourceImportId,
  });
  if (matches.length === 0) {
    throw badRequest(
      "No matching customer row was found in the selected Saved file.",
      "COLLECTION_SOURCE_NO_MATCH",
    );
  }

  const selected = matches[0];
  const selectedRank = buildIdentityRankSignature(selected);
  if (matches.slice(1).some((match) => buildIdentityRankSignature(match) === selectedRank)) {
    throw badRequest(
      "More than one equally strong customer row matched in the selected Saved file.",
      "COLLECTION_SOURCE_AMBIGUOUS_MATCH",
    );
  }
  if (selected.sourceImportId !== sourceImportId) {
    throw badRequest(
      "The Saved matching result did not belong to the selected source file.",
      "COLLECTION_SOURCE_SCOPE_MISMATCH",
    );
  }
  if (
    !selected.callingDate
    || !selected.callingWindowEnd
    || !selected.callingWindowEndExclusive
  ) {
    throw badRequest(
      "The matched Saved row does not contain a valid Calling Date.",
      "COLLECTION_SOURCE_CALLING_DATE_INVALID",
    );
  }

  return selected;
}

export async function verifyEligibleSavedCollectionSource(
  storage: Pick<CollectionStoragePort, "findEligibleCollectionSourceMatches">,
  input: {
    paymentDate: string;
    accountNumber?: string;
    cardNumber?: string;
  },
): Promise<CollectionIndexedSourceMatch> {
  const accountNumber = String(input.accountNumber || "").trim();
  const cardNumber = String(input.cardNumber || "").trim();
  if (!accountNumber && !cardNumber) {
    throw badRequest(
      "Account Number or Card Number is required for Saved source matching.",
      "COLLECTION_SOURCE_NO_MATCH",
    );
  }

  const result = await storage.findEligibleCollectionSourceMatches({
    paymentDate: input.paymentDate,
    ...(accountNumber ? { accountNumber } : {}),
    ...(cardNumber ? { cardNumber } : {}),
  });
  if (result.eligibleSourceCount === 0) {
    throw badRequest(
      "Tiada masterlisting Collection yang aktif untuk tarikh bayaran ini. Sila hubungi superuser.",
      "COLLECTION_SOURCE_NOT_CONFIGURED",
    );
  }
  if (result.matches.length === 0) {
    throw badRequest(
      "No exact Account Number or Card Number match was found in an active Collection masterlisting.",
      "COLLECTION_SOURCE_NO_MATCH",
    );
  }
  if (result.matches.length > 1) {
    const hasAccountMatch = result.matches.some((match) => (
      match.matchBasis === "account_number" || match.matchBasis === "account_and_card"
    ));
    const hasCardMatch = result.matches.some((match) => (
      match.matchBasis === "card_number" || match.matchBasis === "account_and_card"
    ));
    if (accountNumber && cardNumber && hasAccountMatch && hasCardMatch) {
      throw badRequest(
        "Account Number and Card Number resolve to different active masterlisting rows.",
        "COLLECTION_SOURCE_IDENTITY_CONFLICT",
      );
    }
  }
  if (result.matches.length > 1 || result.matches[0]!.duplicateSourceCount > 1) {
    throw badRequest(
      "More than one active masterlisting row matched this Account/Card. Ask superuser to resolve the source ambiguity.",
      "COLLECTION_SOURCE_AMBIGUOUS_MATCH",
    );
  }

  const match = result.matches[0]!;
  if (!match.callingDate || !match.callingWindowEnd || !match.callingWindowEndExclusive) {
    throw badRequest(
      "The matched Saved row does not contain a valid Calling Date.",
      "COLLECTION_SOURCE_CALLING_DATE_INVALID",
    );
  }
  if (!match.totalDue) {
    throw badRequest(
      "The matched Saved row does not contain a valid TOTAL DUE value.",
      "COLLECTION_SOURCE_TOTAL_DUE_MISSING",
    );
  }
  return match;
}

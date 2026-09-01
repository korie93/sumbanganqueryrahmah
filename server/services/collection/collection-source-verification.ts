import { badRequest, notFound } from "../../http/errors";
import type { SavedCollectionSourceLookup, SavedCollectionSourceMatch } from "../../repositories/search-repository-types";
import type { CollectionStoragePort } from "./collection-service-support";

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

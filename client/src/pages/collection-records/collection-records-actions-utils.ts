import {
  parseApiError,
  parseCollectionApiErrorDetails,
} from "@/pages/collection/utils";

export type DeleteRecordErrorFeedback = {
  isVersionConflict: boolean;
  title: string;
  description: string;
};

export function buildDeleteRecordErrorFeedback(error: unknown): DeleteRecordErrorFeedback {
  const apiErrorDetails = parseCollectionApiErrorDetails(error);
  if (
    apiErrorDetails.status === 409
    && apiErrorDetails.code === "COLLECTION_RECORD_VERSION_CONFLICT"
  ) {
    return {
      isVersionConflict: true,
      title: "Record Updated Elsewhere",
      description:
        "This record changed in another session. The list has been refreshed. Reopen the record and try again.",
    };
  }

  return {
    isVersionConflict: false,
    title: "Failed to Delete Record",
    description: apiErrorDetails.message || parseApiError(error),
  };
}

export function resolveCollectionRecordsExportBlockReason(options: {
  totalRecords: number;
  exportingExcel: boolean;
  exportingPdf: boolean;
}) {
  if (options.totalRecords === 0) {
    return "no_data";
  }

  if (options.exportingExcel || options.exportingPdf) {
    return "busy";
  }

  return null;
}

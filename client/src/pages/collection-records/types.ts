import type { CollectionReceiptValidationStatus } from "@/lib/api";

export type ReceiptPreviewKind = "pdf" | "image" | "unsupported";

export type CollectionRecordReviewFilter = "all" | "flagged" | CollectionReceiptValidationStatus;
export type CollectionRecordDuplicateFilter = "all" | "duplicates";

export type CollectionRecordFilters = {
  from?: string;
  to?: string;
  search?: string;
  nickname?: string;
  receiptValidationStatus?: Exclude<CollectionRecordReviewFilter, "all">;
  duplicateOnly?: boolean;
  limit?: number;
  offset?: number;
};

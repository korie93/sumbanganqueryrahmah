export type ReceiptPreviewKind = "pdf" | "image" | "unsupported";

export type CollectionRecordFilters = {
  from?: string | undefined;
  to?: string | undefined;
  search?: string | undefined;
  nickname?: string | undefined;
  leaderId?: string | undefined;
  sourceImportIds?: string[] | undefined;
  agingBuckets?: Array<"D3" | "D4" | "D5" | "D6"> | undefined;
  classifications?: Array<"cp" | "abort_cp"> | undefined;
  sortBy?: "paymentDate" | "amount" | "customerName" | "source" | "aging" | "classification" | undefined;
  sortDirection?: "asc" | "desc" | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
  cursor?: string | null | undefined;
};

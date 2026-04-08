export type ReceiptPreviewKind = "pdf" | "image" | "unsupported";

export type CollectionRecordFilters = {
  from?: string | undefined;
  to?: string | undefined;
  search?: string | undefined;
  nickname?: string | undefined;
  page?: number | undefined;
  pageSize?: number | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
  cursor?: string | null | undefined;
};

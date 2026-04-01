export type ReceiptPreviewKind = "pdf" | "image" | "unsupported";

export type CollectionRecordFilters = {
  from?: string;
  to?: string;
  search?: string;
  nickname?: string;
  page?: number;
  pageSize?: number;
  limit?: number;
  offset?: number;
  cursor?: string | null;
};

import type {
  CollectionPurgeSummaryResponse,
  CollectionRecord,
} from "@/lib/api";
import { createRetryableModuleLoader } from "@/lib/retryable-module-loader";
import type { CollectionAmountMyrNumber } from "@shared/collection-amount-types";

export type CollectionRecordsSummary = {
  totalRecords: number;
  totalAmount: CollectionAmountMyrNumber;
};

export type UseCollectionRecordsActionsArgs = {
  canPurgeOldRecords: boolean;
  canUseNicknameFilter: boolean;
  fromDate: string;
  toDate: string;
  nicknameFilter: string;
  summary: CollectionRecordsSummary;
  loadExportRecords: () => Promise<CollectionRecord[]>;
  onRefreshRecords: () => Promise<unknown>;
};

export type CollectionRecordsPurgeSummaryViewModel = Pick<
  CollectionPurgeSummaryResponse,
  "cutoffDate" | "eligibleRecords" | "totalAmount"
>;

type CollectionRecordsExportModule = typeof import("@/pages/collection-records/export");

export const loadCollectionRecordsExportModule = createRetryableModuleLoader<CollectionRecordsExportModule>(
  () => import("@/pages/collection-records/export"),
);

export function toCollectionRecordsPurgeSummaryViewModel(
  summary: CollectionPurgeSummaryResponse | null,
): CollectionRecordsPurgeSummaryViewModel | null {
  if (!summary) {
    return null;
  }

  return {
    cutoffDate: summary.cutoffDate,
    eligibleRecords: summary.eligibleRecords,
    totalAmount: summary.totalAmount,
  };
}

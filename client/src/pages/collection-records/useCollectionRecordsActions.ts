import { useCallback } from "react";
import type {
  UseCollectionRecordsActionsArgs,
} from "@/pages/collection-records/collection-records-actions-shared";
import { useCollectionRecordsDeleteAction } from "@/pages/collection-records/useCollectionRecordsDeleteAction";
import { useCollectionRecordsExportAction } from "@/pages/collection-records/useCollectionRecordsExportAction";
import { useCollectionRecordsPurgeAction } from "@/pages/collection-records/useCollectionRecordsPurgeAction";

export {
  buildDeleteRecordErrorFeedback,
  resolveCollectionRecordsExportBlockReason,
} from "@/pages/collection-records/collection-records-actions-utils";
export type {
  DeleteRecordErrorFeedback,
} from "@/pages/collection-records/collection-records-actions-utils";

export function useCollectionRecordsActions({
  canPurgeOldRecords,
  canUseNicknameFilter,
  fromDate,
  toDate,
  nicknameFilter,
  summary,
  loadExportRecords,
  onRefreshRecords,
}: UseCollectionRecordsActionsArgs) {
  const purgeAction = useCollectionRecordsPurgeAction({
    canPurgeOldRecords,
    onRefreshRecords,
  });
  const refreshAfterDelete = useCallback(
    () =>
      Promise.all([
        onRefreshRecords(),
        canPurgeOldRecords ? purgeAction.refreshPurgeSummary() : Promise.resolve(),
      ]),
    [canPurgeOldRecords, onRefreshRecords, purgeAction.refreshPurgeSummary],
  );
  const deleteAction = useCollectionRecordsDeleteAction({
    onAfterDelete: refreshAfterDelete,
  });
  const exportAction = useCollectionRecordsExportAction({
    canUseNicknameFilter,
    fromDate,
    toDate,
    nicknameFilter,
    summary,
    loadExportRecords,
  });

  return {
    refreshPurgeSummary: purgeAction.refreshPurgeSummary,
    requestDelete: deleteAction.requestDelete,
    toolbar: {
      exportingExcel: exportAction.exportingExcel,
      exportingPdf: exportAction.exportingPdf,
      purgeSummaryLoading: purgeAction.toolbar.purgeSummaryLoading,
      purgingOldRecords: purgeAction.toolbar.purgingOldRecords,
      purgeSummary: purgeAction.toolbar.purgeSummary,
      onOpenPurgeDialog: purgeAction.toolbar.onOpenPurgeDialog,
      onExportExcel: exportAction.onExportExcel,
      onExportPdf: exportAction.onExportPdf,
    },
    deleteDialog: deleteAction.deleteDialog,
    purgeDialog: purgeAction.purgeDialog,
  };
}

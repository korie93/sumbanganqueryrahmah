import { useEffect, useMemo, useState } from "react";
import { formatImportUploadSize, resolveImportUploadLimitBytes } from "@/pages/import/upload-limits";
import type { ImportProps } from "@/pages/import/types";
import { useBulkImportState } from "@/pages/import/useBulkImportState";
import { useSingleImportState } from "@/pages/import/useSingleImportState";

export function useImportPageState({ onNavigate, importUploadLimitBytes }: ImportProps) {
  const [activeTab, setActiveTab] = useState<"single" | "bulk">("single");
  const resolvedImportUploadLimitBytes = useMemo(
    () => resolveImportUploadLimitBytes(importUploadLimitBytes),
    [importUploadLimitBytes],
  );
  const maxUploadSizeLabel = useMemo(
    () => formatImportUploadSize(resolvedImportUploadLimitBytes),
    [resolvedImportUploadLimitBytes],
  );
  const singleState = useSingleImportState({
    importUploadLimitBytes: resolvedImportUploadLimitBytes,
    onNavigate,
  });
  const bulkState = useBulkImportState({
    importUploadLimitBytes: resolvedImportUploadLimitBytes,
    maxUploadSizeLabel,
  });
  const { resetSingleForInactiveTab } = singleState;
  const { clearBulkForInactiveTab } = bulkState;

  useEffect(() => {
    if (activeTab === "bulk") {
      resetSingleForInactiveTab();
      return;
    }

    clearBulkForInactiveTab();
  }, [activeTab, clearBulkForInactiveTab, resetSingleForInactiveTab]);

  return {
    activeTab,
    setActiveTab,
    maxUploadSizeLabel,
    ...singleState,
    ...bulkState,
  };
}

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildSavedDuplicateHashCounts,
  buildSavedWorkspaceSummary,
  filterSavedImportsByWorkspaceView,
  resolveSavedActiveImportId,
  type SavedWorkspaceView,
} from "@/pages/saved/saved-workspace";
import type { ImportItem } from "@/pages/saved/types";

type SavedWorkspaceStateOptions = {
  hasMoreImports: boolean;
  imports: ImportItem[];
  totalImports: number;
};

export function useSavedWorkspaceState({
  hasMoreImports,
  imports,
  totalImports,
}: SavedWorkspaceStateOptions) {
  const [workspaceView, setWorkspaceView] = useState<SavedWorkspaceView>("all");
  const [activeImportId, setActiveImportId] = useState<string | null>(null);

  const workspaceSummary = useMemo(
    () => buildSavedWorkspaceSummary(imports, totalImports, hasMoreImports),
    [hasMoreImports, imports, totalImports],
  );
  const duplicateHashCounts = useMemo(
    () => buildSavedDuplicateHashCounts(imports),
    [imports],
  );
  const visibleImports = useMemo(
    () => filterSavedImportsByWorkspaceView(imports, workspaceView),
    [imports, workspaceView],
  );

  useEffect(() => {
    const resolvedImportId = resolveSavedActiveImportId(visibleImports, activeImportId);
    if (resolvedImportId !== activeImportId) {
      setActiveImportId(resolvedImportId);
    }
  }, [activeImportId, visibleImports]);

  const activeImport = useMemo(
    () => visibleImports.find((item) => item.id === activeImportId) ?? null,
    [activeImportId, visibleImports],
  );

  const handleInspectImport = useCallback((importItem: { id: string }) => {
    setActiveImportId(importItem.id);
  }, []);

  return {
    activeImport,
    activeImportId,
    duplicateHashCounts,
    handleInspectImport,
    setWorkspaceView,
    visibleImports,
    workspaceSummary,
    workspaceView,
  };
}

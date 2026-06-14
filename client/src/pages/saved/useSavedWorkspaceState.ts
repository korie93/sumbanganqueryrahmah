import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildSavedDuplicateHashCounts,
  buildSavedWorkspaceSummary,
  resolveSavedActiveImportId,
  type SavedWorkspaceView,
} from "@/pages/saved/saved-workspace";
import type { ImportItem } from "@/pages/saved/types";

type SavedWorkspaceStateOptions = {
  hasMoreImports: boolean;
  imports: ImportItem[];
  totalImports: number;
  workspaceView: SavedWorkspaceView;
  onWorkspaceViewChange: (view: SavedWorkspaceView) => void;
};

export function useSavedWorkspaceState({
  hasMoreImports,
  imports,
  totalImports,
  workspaceView,
  onWorkspaceViewChange,
}: SavedWorkspaceStateOptions) {
  const [activeImportId, setActiveImportId] = useState<string | null>(null);

  const workspaceSummary = useMemo(
    () => buildSavedWorkspaceSummary(imports, totalImports, hasMoreImports),
    [hasMoreImports, imports, totalImports],
  );
  const duplicateHashCounts = useMemo(
    () => buildSavedDuplicateHashCounts(imports),
    [imports],
  );
  const visibleImports = imports;

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
  const handleCloseImportDetails = useCallback(() => {
    setActiveImportId(null);
  }, []);

  return {
    activeImport,
    activeImportId,
    duplicateHashCounts,
    handleCloseImportDetails,
    handleInspectImport,
    setWorkspaceView: onWorkspaceViewChange,
    visibleImports,
    workspaceSummary,
    workspaceView,
  };
}

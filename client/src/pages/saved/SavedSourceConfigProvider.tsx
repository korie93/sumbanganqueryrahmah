import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { CollectionSourceConfig } from "@/lib/api/collection-source-configs";
import { SavedSourceConfigDialog } from "@/pages/saved/SavedSourceConfigDialog";
import type { ImportItem } from "@/pages/saved/types";
import { useSavedSourceConfigState } from "@/pages/saved/useSavedSourceConfigState";

type SavedSourceConfigContextValue = {
  configsByImportId: ReadonlyMap<string, CollectionSourceConfig>;
  enabled: boolean;
  loadFailed: boolean;
  loading: boolean;
  mutationPending: boolean;
  openConfig: (item: ImportItem) => void;
  refresh: () => void;
};

const disabledContextValue: SavedSourceConfigContextValue = {
  configsByImportId: new Map(),
  enabled: false,
  loadFailed: false,
  loading: false,
  mutationPending: false,
  openConfig: () => {},
  refresh: () => {},
};

const SavedSourceConfigContext = createContext<SavedSourceConfigContextValue>(disabledContextValue);

export function useSavedSourceConfig() {
  return useContext(SavedSourceConfigContext);
}

export function SavedSourceConfigProvider({
  children,
  enabled,
}: {
  children: ReactNode;
  enabled: boolean;
}) {
  const state = useSavedSourceConfigState(enabled);
  const contextValue = useMemo<SavedSourceConfigContextValue>(() => ({
    configsByImportId: state.configsByImportId,
    enabled,
    loadFailed: state.loadFailed,
    loading: state.loading,
    mutationPending: state.mutationPending !== null,
    openConfig: state.openConfig,
    refresh: state.refresh,
  }), [
    enabled,
    state.configsByImportId,
    state.loadFailed,
    state.loading,
    state.mutationPending,
    state.openConfig,
    state.refresh,
  ]);

  return (
    <SavedSourceConfigContext.Provider value={contextValue}>
      {children}
      {enabled ? (
        <SavedSourceConfigDialog
          config={state.selectedConfig}
          form={state.form}
          formError={state.formError}
          importItem={state.selectedImport}
          mutationPending={state.mutationPending}
          open={state.dialogOpen}
          onDelete={state.deleteConfig}
          onFormChange={state.updateForm}
          onOpenChange={state.onDialogOpenChange}
          onSave={state.saveConfig}
        />
      ) : null}
    </SavedSourceConfigContext.Provider>
  );
}

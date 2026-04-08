import {
  type UseSettingsDevMailOutboxArgs,
} from "@/pages/settings/settings-dev-mail-outbox-shared";
import { useDevMailOutboxDataState } from "@/pages/settings/useDevMailOutboxDataState";
import { useDevMailOutboxMutationState } from "@/pages/settings/useDevMailOutboxMutationState";

export type {
  DevMailOutboxPaginationState,
  DevMailOutboxQueryState,
} from "@/pages/settings/settings-dev-mail-outbox-shared";

export function useSettingsDevMailOutbox({
  isMountedRef,
  toast,
}: UseSettingsDevMailOutboxArgs) {
  const dataState = useDevMailOutboxDataState({
    isMountedRef,
    toast,
  });
  const mutationState = useDevMailOutboxMutationState({
    getCurrentDevMailOutboxQuery: dataState.getCurrentDevMailOutboxQuery,
    isMountedRef,
    loadDevMailOutbox: dataState.loadDevMailOutbox,
    toast,
  });

  return {
    clearingDevMailOutbox: mutationState.clearingDevMailOutbox,
    deletingDevMailOutboxId: mutationState.deletingDevMailOutboxId,
    devMailOutboxEnabled: dataState.devMailOutboxEnabled,
    devMailOutboxEntries: dataState.devMailOutboxEntries,
    devMailOutboxLoaded: dataState.devMailOutboxLoaded,
    devMailOutboxLoading: dataState.devMailOutboxLoading,
    devMailOutboxPagination: dataState.devMailOutboxPagination,
    devMailOutboxQuery: dataState.devMailOutboxQuery,
    handleClearDevMailOutbox: mutationState.handleClearDevMailOutbox,
    handleDeleteDevMailOutboxEntry: mutationState.handleDeleteDevMailOutboxEntry,
    loadDevMailOutbox: dataState.loadDevMailOutbox,
    refreshDevMailOutboxSection: dataState.refreshDevMailOutboxSection,
    updateDevMailOutboxQuery: dataState.updateDevMailOutboxQuery,
  };
}

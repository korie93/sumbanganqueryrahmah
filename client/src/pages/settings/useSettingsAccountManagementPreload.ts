import { useEffect } from "react";
import { getPendingAccountManagementPreloadKeys } from "@/pages/settings/settings-account-management-boundary-utils";

type UseSettingsAccountManagementPreloadArgs = {
  devMailOutboxLoaded: boolean;
  devMailOutboxLoading: boolean;
  isSuperuser: boolean;
  loadDevMailOutbox: () => Promise<unknown>;
  loadManagedUsers: () => Promise<unknown>;
  loadPendingResetRequests: () => Promise<unknown>;
  managedUsersLoaded: boolean;
  managedUsersLoading: boolean;
  pendingResetRequestsLoaded: boolean;
  pendingResetRequestsLoading: boolean;
};

export function useSettingsAccountManagementPreload({
  devMailOutboxLoaded,
  devMailOutboxLoading,
  isSuperuser,
  loadDevMailOutbox,
  loadManagedUsers,
  loadPendingResetRequests,
  managedUsersLoaded,
  managedUsersLoading,
  pendingResetRequestsLoaded,
  pendingResetRequestsLoading,
}: UseSettingsAccountManagementPreloadArgs) {
  useEffect(() => {
    const pendingKeys = getPendingAccountManagementPreloadKeys({
      devMailOutboxLoaded,
      devMailOutboxLoading,
      isSuperuser,
      managedUsersLoaded,
      managedUsersLoading,
      pendingResetRequestsLoaded,
      pendingResetRequestsLoading,
    });

    if (pendingKeys.length === 0) {
      return;
    }

    const pendingLoads = pendingKeys.map((key) => {
      if (key === "managedUsers") {
        return loadManagedUsers();
      }
      if (key === "pendingResetRequests") {
        return loadPendingResetRequests();
      }
      return loadDevMailOutbox();
    });

    void Promise.all(pendingLoads);
  }, [
    devMailOutboxLoaded,
    devMailOutboxLoading,
    isSuperuser,
    loadDevMailOutbox,
    loadManagedUsers,
    loadPendingResetRequests,
    managedUsersLoaded,
    managedUsersLoading,
    pendingResetRequestsLoaded,
    pendingResetRequestsLoading,
  ]);
}

import { useManagedUsersDataState } from "@/pages/settings/useManagedUsersDataState";
import { usePendingResetRequestsDataState } from "@/pages/settings/usePendingResetRequestsDataState";
import { type UseSettingsManagedUserDataArgs } from "@/pages/settings/settings-managed-user-data-shared";

export type {
  ManagedUsersPaginationState,
  ManagedUsersQueryState,
  PendingResetRequestsPaginationState,
  PendingResetRequestsQueryState,
} from "@/pages/settings/settings-managed-user-data-shared";

export function useSettingsManagedUserData({
  isMountedRef,
  toast,
}: UseSettingsManagedUserDataArgs) {
  const managedUsersData = useManagedUsersDataState({
    isMountedRef,
    toast,
  });
  const pendingResetRequestsData = usePendingResetRequestsDataState({
    isMountedRef,
    toast,
  });

  return {
    ...managedUsersData,
    ...pendingResetRequestsData,
  };
}

import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { ManagedUser } from "@/pages/settings/types";
import { useSettingsManagedUserLifecycleActions } from "@/pages/settings/useSettingsManagedUserLifecycleActions";
import type {
  ManagedAccountStatus,
  ManagedSecretDialogParams,
  ToastFn,
} from "@/pages/settings/useSettingsManagedUserMutationShared";
import { useSettingsManagedUserUpdate } from "@/pages/settings/useSettingsManagedUserUpdate";

type UseSettingsManagedUserActionsArgs = {
  isMountedRef: MutableRefObject<boolean>;
  loadDevMailOutbox: () => Promise<unknown>;
  loadManagedUsers: () => Promise<ManagedUser[] | undefined>;
  loadPendingResetRequests: () => Promise<unknown>;
  managedEmailInput: string;
  managedFullNameInput: string;
  managedIsBanned: boolean;
  managedRoleInput: "admin" | "user";
  managedSaving: boolean;
  managedSelectedUser: ManagedUser | null;
  managedStatusInput: ManagedAccountStatus;
  managedUsernameInput: string;
  onManagedDialogOpenChange: (open: boolean) => void;
  openManagedSecretDialog: (params: ManagedSecretDialogParams) => void;
  setManagedSaving: Dispatch<SetStateAction<boolean>>;
  toast: ToastFn;
};

export function useSettingsManagedUserActions({
  isMountedRef,
  loadDevMailOutbox,
  loadManagedUsers,
  loadPendingResetRequests,
  managedEmailInput,
  managedFullNameInput,
  managedIsBanned,
  managedRoleInput,
  managedSaving,
  managedSelectedUser,
  managedStatusInput,
  managedUsernameInput,
  onManagedDialogOpenChange,
  openManagedSecretDialog,
  setManagedSaving,
  toast,
}: UseSettingsManagedUserActionsArgs) {
  const managedUserUpdate = useSettingsManagedUserUpdate({
    isMountedRef,
    loadManagedUsers,
    loadPendingResetRequests,
    managedEmailInput,
    managedFullNameInput,
    managedIsBanned,
    managedRoleInput,
    managedSaving,
    managedSelectedUser,
    managedStatusInput,
    managedUsernameInput,
    onManagedDialogOpenChange,
    setManagedSaving,
    toast,
  });

  const managedUserLifecycle = useSettingsManagedUserLifecycleActions({
    isMountedRef,
    loadDevMailOutbox,
    loadManagedUsers,
    loadPendingResetRequests,
    managedSelectedUser,
    onManagedDialogOpenChange,
    openManagedSecretDialog,
    toast,
  });

  return {
    ...managedUserUpdate,
    ...managedUserLifecycle,
  };
}

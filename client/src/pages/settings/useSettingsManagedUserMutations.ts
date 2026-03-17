import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import type { ManagedUser } from "@/pages/settings/types";
import { useSettingsManagedUserActions } from "@/pages/settings/useSettingsManagedUserActions";
import { useSettingsManagedUserCreate } from "@/pages/settings/useSettingsManagedUserCreate";
import type {
  ManagedAccountStatus,
  ManagedSecretDialogParams,
  ToastFn,
} from "@/pages/settings/useSettingsManagedUserMutationShared";

type UseSettingsManagedUserMutationsArgs = {
  isMountedRef: MutableRefObject<boolean>;
  toast: ToastFn;
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
};

export function useSettingsManagedUserMutations({
  isMountedRef,
  toast,
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
}: UseSettingsManagedUserMutationsArgs) {
  const createState = useSettingsManagedUserCreate({
    isMountedRef,
    loadDevMailOutbox,
    loadManagedUsers,
    openManagedSecretDialog,
    toast,
  });

  const existingUserActions = useSettingsManagedUserActions({
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
  });

  return {
    ...createState,
    ...existingUserActions,
  };
}

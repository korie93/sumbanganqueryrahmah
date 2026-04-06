import type { MutableRefObject } from "react";
import type { ManagedUser } from "@/pages/settings/types";
import type {
  ManagedSecretDialogParams,
  ToastFn,
} from "@/pages/settings/useSettingsManagedUserMutationShared";

export type UseSettingsManagedUserLifecycleActionsArgs = {
  isMountedRef: MutableRefObject<boolean>;
  loadDevMailOutbox: () => Promise<unknown>;
  loadManagedUsers: () => Promise<ManagedUser[] | undefined>;
  loadPendingResetRequests: () => Promise<unknown>;
  managedSelectedUser: ManagedUser | null;
  onManagedDialogOpenChange: (open: boolean) => void;
  openManagedSecretDialog: (params: ManagedSecretDialogParams) => void;
  toast: ToastFn;
};

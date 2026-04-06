import type { MutableRefObject } from "react";
import type { ManagedSecretDialogParams, ToastFn } from "@/pages/settings/useSettingsManagedUserMutationShared";
import type { ManagedUser } from "@/pages/settings/types";

export type ManagedUserCreateRole = "admin" | "user";

export type ManagedUserCreateDraft = {
  createEmailInput: string;
  createFullNameInput: string;
  createRoleInput: ManagedUserCreateRole;
  createUsernameInput: string;
};

export type UseSettingsManagedUserCreateArgs = {
  isMountedRef: MutableRefObject<boolean>;
  loadDevMailOutbox: () => Promise<unknown>;
  loadManagedUsers: () => Promise<ManagedUser[] | undefined>;
  openManagedSecretDialog: (params: ManagedSecretDialogParams) => void;
  toast: ToastFn;
};

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import {
  updateManagedUserAccount,
  updateManagedUserRole,
  updateManagedUserStatus,
} from "@/lib/api";
import type { ManagedUser } from "@/pages/settings/types";
import type {
  ManagedAccountStatus,
  ToastFn,
} from "@/pages/settings/useSettingsManagedUserMutationShared";
import {
  buildMutationSuccessToast,
} from "@/lib/mutation-feedback";
import {
  buildSettingsMutationErrorToast,
} from "@/pages/settings/utils";
import {
  normalizeCredentialEmail,
  normalizeCredentialFullName,
  normalizeCredentialUsername,
  validateCredentialUsername,
} from "@/pages/settings/settings-credential-validation";

type UseSettingsManagedUserUpdateArgs = {
  isMountedRef: MutableRefObject<boolean>;
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
  setManagedSaving: Dispatch<SetStateAction<boolean>>;
  toast: ToastFn;
};

export function useSettingsManagedUserUpdate({
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
}: UseSettingsManagedUserUpdateArgs) {
  const handleSaveManagedUser = useCallback(async () => {
    if (!managedSelectedUser || managedSaving) return;

    const normalizedUsername = normalizeCredentialUsername(managedUsernameInput);
    const normalizedEmail = normalizeCredentialEmail(managedEmailInput);
    const normalizedFullName = normalizeCredentialFullName(managedFullNameInput);
    const payload: { username?: string; fullName?: string | null; email?: string | null } = {};

    if (normalizedFullName !== (managedSelectedUser.fullName || "")) {
      payload.fullName = normalizedFullName || null;
    }

    if (normalizedUsername !== managedSelectedUser.username) {
      const usernameValidationError = validateCredentialUsername(normalizedUsername);
      if (usernameValidationError) {
        toast({
          title: "Validation Error",
          description: usernameValidationError,
          variant: "destructive",
        });
        return;
      }
      payload.username = normalizedUsername;
    }

    if (normalizedEmail !== (managedSelectedUser.email || "").toLowerCase()) {
      payload.email = normalizedEmail || null;
    }

    setManagedSaving(true);
    try {
      if (
        payload.username !== undefined
        || payload.fullName !== undefined
        || payload.email !== undefined
      ) {
        await updateManagedUserAccount(managedSelectedUser.id, payload);
      }

      if (managedRoleInput !== managedSelectedUser.role) {
        await updateManagedUserRole(managedSelectedUser.id, managedRoleInput);
      }

      if (
        managedStatusInput !== managedSelectedUser.status
        || managedIsBanned !== Boolean(managedSelectedUser.isBanned)
      ) {
        await updateManagedUserStatus(managedSelectedUser.id, {
          status: managedStatusInput,
          isBanned: managedIsBanned,
        });
      }

      toast(buildMutationSuccessToast({
        title: "Account Updated",
        description: `Updated account settings for ${managedSelectedUser.username}.`,
      }));
      if (!isMountedRef.current) return;
      onManagedDialogOpenChange(false);
      await Promise.all([loadManagedUsers(), loadPendingResetRequests()]);
    } catch (error: unknown) {
      toast(buildSettingsMutationErrorToast(error, "Update Failed"));
    } finally {
      if (!isMountedRef.current) return;
      setManagedSaving(false);
    }
  }, [
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
  ]);

  return {
    handleSaveManagedUser,
  };
}

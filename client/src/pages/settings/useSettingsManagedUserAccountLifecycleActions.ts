import { useCallback, useRef, useState } from "react";
import {
  deleteManagedUserAccount,
  updateManagedUserStatus,
} from "@/lib/api";
import {
  buildMutationErrorToast,
  buildMutationSuccessToast,
} from "@/lib/mutation-feedback";
import type { ManagedUser } from "@/pages/settings/types";
import { normalizeSettingsErrorPayload } from "@/pages/settings/utils";
import type { UseSettingsManagedUserLifecycleActionsArgs } from "@/pages/settings/settings-managed-user-lifecycle-shared";
import { normalizeManagedUserLifecycleTargetId } from "@/pages/settings/settings-managed-user-lifecycle-utils";

type UseSettingsManagedUserAccountLifecycleActionsArgs = Pick<
  UseSettingsManagedUserLifecycleActionsArgs,
  "isMountedRef"
  | "loadManagedUsers"
  | "loadPendingResetRequests"
  | "managedSelectedUser"
  | "onManagedDialogOpenChange"
  | "toast"
>;

export function useSettingsManagedUserAccountLifecycleActions({
  isMountedRef,
  loadManagedUsers,
  loadPendingResetRequests,
  managedSelectedUser,
  onManagedDialogOpenChange,
  toast,
}: UseSettingsManagedUserAccountLifecycleActionsArgs) {
  const deleteManagedUserLocksRef = useRef<Set<string>>(new Set());

  const [deletingManagedUserId, setDeletingManagedUserId] = useState<string | null>(null);

  const handleManagedBanToggle = useCallback(async (user: ManagedUser) => {
    const normalizedId = normalizeManagedUserLifecycleTargetId(user.id);
    if (!normalizedId) {
      return;
    }

    const nextIsBanned = !Boolean(user.isBanned);
    if (!window.confirm(`${nextIsBanned ? "Ban" : "Unban"} ${user.username}?`)) {
      return;
    }

    try {
      await updateManagedUserStatus(normalizedId, {
        isBanned: nextIsBanned,
      });
      toast(buildMutationSuccessToast({
        title: nextIsBanned ? "Account Banned" : "Account Unbanned",
        description: `${user.username} has been ${nextIsBanned ? "banned" : "unbanned"}.`,
      }));
      await Promise.all([loadManagedUsers(), loadPendingResetRequests()]);
    } catch (error: unknown) {
      const parsed = normalizeSettingsErrorPayload(error);
      toast(buildMutationErrorToast({
        title: parsed.code || "Status Update Failed",
        error,
        fallbackDescription: parsed.message,
      }));
    }
  }, [loadManagedUsers, loadPendingResetRequests, toast]);

  const handleDeleteManagedUser = useCallback(async (user: ManagedUser) => {
    const normalizedId = normalizeManagedUserLifecycleTargetId(user.id);
    if (!normalizedId || deleteManagedUserLocksRef.current.has(normalizedId)) {
      return;
    }

    deleteManagedUserLocksRef.current.add(normalizedId);
    setDeletingManagedUserId(normalizedId);

    try {
      await deleteManagedUserAccount(normalizedId);
      if (managedSelectedUser?.id === normalizedId) {
        onManagedDialogOpenChange(false);
      }
      toast(buildMutationSuccessToast({
        title: "Account Deleted",
        description: `${user.username} has been deleted safely.`,
      }));
      await Promise.all([loadManagedUsers(), loadPendingResetRequests()]);
    } catch (error: unknown) {
      const parsed = normalizeSettingsErrorPayload(error);
      toast(buildMutationErrorToast({
        title: parsed.code || "Delete Failed",
        error,
        fallbackDescription: parsed.message,
      }));
    } finally {
      deleteManagedUserLocksRef.current.delete(normalizedId);
      if (isMountedRef.current) {
        setDeletingManagedUserId((current) => (current === normalizedId ? null : current));
      }
    }
  }, [
    isMountedRef,
    loadManagedUsers,
    loadPendingResetRequests,
    managedSelectedUser,
    onManagedDialogOpenChange,
    toast,
  ]);

  return {
    deletingManagedUserId,
    handleDeleteManagedUser,
    handleManagedBanToggle,
  };
}

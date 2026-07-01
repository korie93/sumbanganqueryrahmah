import { useCallback, useRef, useState } from "react";
import {
  deleteManagedUserAccount,
  updateManagedUserStatus,
} from "@/lib/api";
import {
  buildMutationSuccessToast,
} from "@/lib/mutation-feedback";
import type { ManagedUser } from "@/pages/settings/types";
import { buildSettingsMutationErrorToast } from "@/pages/settings/utils";
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

    const nextIsBanned = !user.isBanned;

    try {
      await updateManagedUserStatus(normalizedId, {
        isBanned: nextIsBanned,
      });
      if (!isMountedRef.current) {
        return;
      }
      toast(buildMutationSuccessToast({
        title: nextIsBanned ? "Account Banned" : "Account Unbanned",
        description: `${user.username} has been ${nextIsBanned ? "banned" : "unbanned"}.`,
      }));
      await Promise.all([loadManagedUsers(), loadPendingResetRequests()]);
    } catch (error: unknown) {
      if (isMountedRef.current) {
        toast(buildSettingsMutationErrorToast(error, "Status Update Failed"));
      }
    }
  }, [isMountedRef, loadManagedUsers, loadPendingResetRequests, toast]);

  const handleDeleteManagedUser = useCallback(async (user: ManagedUser) => {
    const normalizedId = normalizeManagedUserLifecycleTargetId(user.id);
    if (!normalizedId || deleteManagedUserLocksRef.current.has(normalizedId)) {
      return;
    }

    deleteManagedUserLocksRef.current.add(normalizedId);
    setDeletingManagedUserId(normalizedId);

    try {
      await deleteManagedUserAccount(normalizedId);
      if (!isMountedRef.current) {
        return;
      }
      if (managedSelectedUser?.id === normalizedId) {
        onManagedDialogOpenChange(false);
      }
      toast(buildMutationSuccessToast({
        title: "Account Deleted",
        description: `${user.username} has been deleted safely.`,
      }));
      await Promise.all([loadManagedUsers(), loadPendingResetRequests()]);
    } catch (error: unknown) {
      if (isMountedRef.current) {
        toast(buildSettingsMutationErrorToast(error, "Delete Failed"));
      }
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

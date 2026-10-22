import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";
import {
  updateManagedUserAccount,
  updateManagedUserRole,
  updateManagedUserStatus,
} from "@/lib/api";
import type { ManagedUser } from "@/pages/settings/types";
import type {
  ManagedAccountStatus,
  ManagedEditorFeedback,
  ToastFn,
} from "@/pages/settings/useSettingsManagedUserMutationShared";
import {
  buildMutationSuccessToast,
} from "@/lib/mutation-feedback";
import {
  buildSettingsMutationErrorToast,
} from "@/pages/settings/utils";
import { getManagedUserEditState } from "@/pages/settings/managed-user-edit-state";
import type { ManageableUserRole } from "@shared/user-roles";

type UseSettingsManagedUserUpdateArgs = {
  isMountedRef: MutableRefObject<boolean>;
  loadManagedUsers: () => Promise<ManagedUser[] | undefined>;
  loadPendingResetRequests: () => Promise<unknown>;
  managedEmailInput: string;
  managedEditorFeedback: ManagedEditorFeedback;
  managedFullNameInput: string;
  managedIsBanned: boolean;
  managedRoleInput: ManageableUserRole;
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
  managedEditorFeedback,
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

    const editState = getManagedUserEditState(managedSelectedUser, {
      fullName: managedFullNameInput, username: managedUsernameInput, email: managedEmailInput,
      role: managedRoleInput, status: managedStatusInput, isBanned: managedIsBanned,
    });
    if (!editState.canSave) {
      const validationError = editState.errors.username || editState.errors.email;
      if (validationError) {
        toast({
          title: "Validation Error",
          description: validationError,
          variant: "destructive",
        });
      }
      return;
    }
    const payload = editState.profilePayload;
    const editorSession = managedEditorFeedback.sessionRef.current;
    managedEditorFeedback.publishError(editorSession, null);
    setManagedSaving(true);
    try {
      if (
        payload.username !== undefined
        || payload.fullName !== undefined
        || payload.email !== undefined
      ) {
        await updateManagedUserAccount(managedSelectedUser.id, payload);
      }

      if (editState.roleChanged) {
        await updateManagedUserRole(managedSelectedUser.id, managedRoleInput);
      }

      if (editState.statusChanged) {
        await updateManagedUserStatus(managedSelectedUser.id, {
          status: managedStatusInput,
          isBanned: managedIsBanned,
        });
      }

      if (!isMountedRef.current) return;
      toast(buildMutationSuccessToast({
        title: "Account Updated",
        description: `Updated account settings for ${managedSelectedUser.username}.`,
      }));
      if (managedEditorFeedback.sessionRef.current === editorSession) {
        onManagedDialogOpenChange(false);
      }
      await Promise.all([loadManagedUsers(), loadPendingResetRequests()]);
    } catch (error: unknown) {
      if (isMountedRef.current) {
        const feedback = buildSettingsMutationErrorToast(error, "Update Failed");
        const published = managedEditorFeedback.publishError(editorSession, {
          message: feedback.description,
          ...(feedback.requestId ? { requestId: feedback.requestId } : {}),
        });
        // A closed/replaced editor must not silently swallow a failed request or
        // put its message into the next account's dialog. Keep the old fallback.
        if (!published) toast({ ...feedback, description: `${managedSelectedUser.username}: ${feedback.description}` });
      }
    } finally {
      if (isMountedRef.current) {
        setManagedSaving(false);
      }
    }
  }, [
    isMountedRef,
    loadManagedUsers,
    loadPendingResetRequests,
    managedEmailInput,
    managedEditorFeedback,
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

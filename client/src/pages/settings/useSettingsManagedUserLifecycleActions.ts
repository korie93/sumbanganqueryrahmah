import { useCallback, useRef, useState, type MutableRefObject } from "react";
import {
  deleteManagedUserAccount,
  resendManagedUserActivation,
  resetManagedUserPassword,
  updateManagedUserStatus,
} from "@/lib/api";
import type { ManagedUser } from "@/pages/settings/types";
import {
  formatActivationExpiry,
  isDevOutboxActivation,
  type ManagedSecretDialogParams,
  type ToastFn,
} from "@/pages/settings/useSettingsManagedUserMutationShared";
import { normalizeSettingsErrorPayload } from "@/pages/settings/utils";

type UseSettingsManagedUserLifecycleActionsArgs = {
  isMountedRef: MutableRefObject<boolean>;
  loadDevMailOutbox: () => Promise<unknown>;
  loadManagedUsers: () => Promise<ManagedUser[] | undefined>;
  loadPendingResetRequests: () => Promise<unknown>;
  managedSelectedUser: ManagedUser | null;
  onManagedDialogOpenChange: (open: boolean) => void;
  openManagedSecretDialog: (params: ManagedSecretDialogParams) => void;
  toast: ToastFn;
};

export function useSettingsManagedUserLifecycleActions({
  isMountedRef,
  loadDevMailOutbox,
  loadManagedUsers,
  loadPendingResetRequests,
  managedSelectedUser,
  onManagedDialogOpenChange,
  openManagedSecretDialog,
  toast,
}: UseSettingsManagedUserLifecycleActionsArgs) {
  const resendActivationLocksRef = useRef<Set<string>>(new Set());
  const resetPasswordLocksRef = useRef<Set<string>>(new Set());
  const deleteManagedUserLocksRef = useRef<Set<string>>(new Set());

  const [deletingManagedUserId, setDeletingManagedUserId] = useState<string | null>(null);

  const handleResetManagedUserPassword = useCallback(async (user: ManagedUser) => {
    if (resetPasswordLocksRef.current.has(user.id)) return;
    if (!window.confirm(`Send password reset email to ${user.username}?`)) return;

    resetPasswordLocksRef.current.add(user.id);
    try {
      const response = await resetManagedUserPassword(user.id);
      const reset = response.reset;
      const recipientEmail = String(reset?.recipientEmail || user.email || user.username);
      const expiresAt = formatActivationExpiry(reset?.expiresAt);
      const previewUrl = String(reset?.previewUrl || "");

      if (isDevOutboxActivation(reset)) {
        toast({
          title: "Password Reset Email Sent",
          description: `Password reset email for ${user.username} was captured in the local development outbox.`,
        });
        openManagedSecretDialog({
          title: "Local Password Reset Email Preview",
          description: `SMTP is not configured, so the password reset email was written to the local development outbox instead. Open this preview URL and follow the reset link before ${expiresAt}.`,
          value: previewUrl,
        });
      } else if (reset?.sent) {
        toast({
          title: "Password Reset Email Sent",
          description: `Password reset email sent to ${recipientEmail}.`,
        });
      } else {
        openManagedSecretDialog({
          title: "Password Reset Email Not Sent",
          description:
            reset?.errorMessage
              ? `The password reset email could not be sent: ${reset.errorMessage}. No account login state was changed, so you can retry after fixing delivery.`
              : "The password reset email could not be sent. No account login state was changed, so you can retry after fixing delivery.",
          value: previewUrl || undefined,
        });
        toast({
          title: "Password Reset Pending",
          description: `${user.username} will need a delivered reset email before choosing a new password.`,
          variant: "destructive",
        });
      }

      if (previewUrl && reset?.sent && reset?.deliveryMode === "smtp") {
        openManagedSecretDialog({
          title: "Password Reset Email Preview",
          description: `Email delivery is configured with a preview URL. The password reset link expires on ${expiresAt}.`,
          value: previewUrl,
        });
      }

      await Promise.all([loadManagedUsers(), loadPendingResetRequests(), loadDevMailOutbox()]);
    } catch (error: unknown) {
      const parsed = normalizeSettingsErrorPayload(error);
      toast({
        title: parsed.code || "Reset Failed",
        description: parsed.message,
        variant: "destructive",
      });
    } finally {
      resetPasswordLocksRef.current.delete(user.id);
    }
  }, [loadDevMailOutbox, loadManagedUsers, loadPendingResetRequests, openManagedSecretDialog, toast]);

  const handleResendManagedUserActivation = useCallback(async (user: ManagedUser) => {
    if (resendActivationLocksRef.current.has(user.id)) return;

    resendActivationLocksRef.current.add(user.id);
    try {
      const response = await resendManagedUserActivation(user.id);
      const activation = response.activation;
      const recipientEmail = String(activation?.recipientEmail || user.email || "");
      const expiresAt = formatActivationExpiry(activation?.expiresAt);
      const previewUrl = String(activation?.previewUrl || "");

      if (isDevOutboxActivation(activation)) {
        toast({
          title: "Activation Reissued",
          description: `Activation email for ${user.username} was captured in the local development outbox.`,
        });
        openManagedSecretDialog({
          title: "Local Activation Email Preview",
          description: `SMTP is not configured, so the reissued activation email was written to the local development outbox instead. Open this preview URL and follow the activation link before ${expiresAt}.`,
          value: previewUrl,
        });
      } else if (activation?.sent) {
        toast({
          title: "Activation Reissued",
          description: `Activation email resent to ${recipientEmail || user.username}.`,
        });
      } else {
        openManagedSecretDialog({
          title: "Activation Email Not Sent",
          description:
            activation?.errorMessage
              ? `The activation email could not be resent: ${activation.errorMessage}. The account remains pending activation until delivery succeeds.`
              : "The activation email could not be resent. The account remains pending activation until delivery succeeds.",
          value: previewUrl || undefined,
        });
        toast({
          title: "Activation Still Pending",
          description: `${user.username} remains pending activation until the email is delivered.`,
          variant: "destructive",
        });
      }

      if (previewUrl && activation?.sent && activation?.deliveryMode === "smtp") {
        openManagedSecretDialog({
          title: "Activation Email Preview",
          description: `Email delivery is configured with a preview URL. The activation link expires on ${expiresAt}.`,
          value: previewUrl,
        });
      }

      await Promise.all([loadManagedUsers(), loadDevMailOutbox()]);
    } catch (error: unknown) {
      const parsed = normalizeSettingsErrorPayload(error);
      toast({
        title: parsed.code || "Activation Failed",
        description: parsed.message,
        variant: "destructive",
      });
    } finally {
      resendActivationLocksRef.current.delete(user.id);
    }
  }, [loadDevMailOutbox, loadManagedUsers, openManagedSecretDialog, toast]);

  const handleManagedBanToggle = useCallback(async (user: ManagedUser) => {
    const nextIsBanned = !Boolean(user.isBanned);
    if (!window.confirm(`${nextIsBanned ? "Ban" : "Unban"} ${user.username}?`)) return;

    try {
      await updateManagedUserStatus(user.id, {
        isBanned: nextIsBanned,
      });
      toast({
        title: nextIsBanned ? "Account Banned" : "Account Unbanned",
        description: `${user.username} has been ${nextIsBanned ? "banned" : "unbanned"}.`,
      });
      await Promise.all([loadManagedUsers(), loadPendingResetRequests()]);
    } catch (error: unknown) {
      const parsed = normalizeSettingsErrorPayload(error);
      toast({
        title: parsed.code || "Status Update Failed",
        description: parsed.message,
        variant: "destructive",
      });
    }
  }, [loadManagedUsers, loadPendingResetRequests, toast]);

  const handleDeleteManagedUser = useCallback(async (user: ManagedUser) => {
    if (deleteManagedUserLocksRef.current.has(user.id)) return;

    deleteManagedUserLocksRef.current.add(user.id);
    setDeletingManagedUserId(user.id);
    try {
      await deleteManagedUserAccount(user.id);
      if (managedSelectedUser?.id === user.id) {
        onManagedDialogOpenChange(false);
      }
      toast({
        title: "Account Deleted",
        description: `${user.username} has been deleted safely.`,
      });
      await Promise.all([loadManagedUsers(), loadPendingResetRequests()]);
    } catch (error: unknown) {
      const parsed = normalizeSettingsErrorPayload(error);
      toast({
        title: parsed.code || "Delete Failed",
        description: parsed.message,
        variant: "destructive",
      });
    } finally {
      deleteManagedUserLocksRef.current.delete(user.id);
      if (isMountedRef.current) {
        setDeletingManagedUserId((current) => (current === user.id ? null : current));
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
    handleResendManagedUserActivation,
    handleResetManagedUserPassword,
  };
}

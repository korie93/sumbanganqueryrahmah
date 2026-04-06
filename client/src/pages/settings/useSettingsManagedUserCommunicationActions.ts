import { useCallback, useRef } from "react";
import {
  resendManagedUserActivation,
  resetManagedUserPassword,
} from "@/lib/api";
import {
  buildMutationErrorToast,
  buildMutationSuccessToast,
} from "@/lib/mutation-feedback";
import {
  formatActivationExpiry,
  isDevOutboxActivation,
} from "@/pages/settings/useSettingsManagedUserMutationShared";
import type { ManagedUser } from "@/pages/settings/types";
import { normalizeSettingsErrorPayload } from "@/pages/settings/utils";
import type { UseSettingsManagedUserLifecycleActionsArgs } from "@/pages/settings/settings-managed-user-lifecycle-shared";
import {
  getManagedUserDeliveryPreviewUrl,
  normalizeManagedUserLifecycleTargetId,
  resolveManagedUserDeliveryRecipient,
  shouldOpenManagedUserSmtpPreview,
} from "@/pages/settings/settings-managed-user-lifecycle-utils";

type UseSettingsManagedUserCommunicationActionsArgs = Pick<
  UseSettingsManagedUserLifecycleActionsArgs,
  "loadDevMailOutbox"
  | "loadManagedUsers"
  | "loadPendingResetRequests"
  | "openManagedSecretDialog"
  | "toast"
>;

export function useSettingsManagedUserCommunicationActions({
  loadDevMailOutbox,
  loadManagedUsers,
  loadPendingResetRequests,
  openManagedSecretDialog,
  toast,
}: UseSettingsManagedUserCommunicationActionsArgs) {
  const resendActivationLocksRef = useRef<Set<string>>(new Set());
  const resetPasswordLocksRef = useRef<Set<string>>(new Set());

  const handleResetManagedUserPassword = useCallback(async (user: ManagedUser) => {
    const normalizedId = normalizeManagedUserLifecycleTargetId(user.id);
    if (!normalizedId || resetPasswordLocksRef.current.has(normalizedId)) {
      return;
    }
    if (!window.confirm(`Send password reset email to ${user.username}?`)) {
      return;
    }

    resetPasswordLocksRef.current.add(normalizedId);
    try {
      const response = await resetManagedUserPassword(normalizedId);
      const reset = response.reset;
      const recipientEmail = resolveManagedUserDeliveryRecipient(user, reset?.recipientEmail);
      const expiresAt = formatActivationExpiry(reset?.expiresAt);
      const previewUrl = getManagedUserDeliveryPreviewUrl(reset?.previewUrl);

      if (isDevOutboxActivation(reset)) {
        toast(buildMutationSuccessToast({
          title: "Password Reset Email Sent",
          description: `Password reset email for ${user.username} was captured in the local development outbox.`,
        }));
        openManagedSecretDialog({
          title: "Local Password Reset Email Preview",
          description: `SMTP is not configured, so the password reset email was written to the local development outbox instead. Open this preview URL and follow the reset link before ${expiresAt}.`,
          value: previewUrl,
        });
      } else if (reset?.sent) {
        toast(buildMutationSuccessToast({
          title: "Password Reset Email Sent",
          description: `Password reset email sent to ${recipientEmail}.`,
        }));
      } else {
        openManagedSecretDialog({
          title: "Password Reset Email Not Sent",
          description:
            reset?.errorMessage
              ? `The password reset email could not be sent: ${reset.errorMessage}. No account login state was changed, so you can retry after fixing delivery.`
              : "The password reset email could not be sent. No account login state was changed, so you can retry after fixing delivery.",
          value: previewUrl || undefined,
        });
        toast(buildMutationErrorToast({
          title: "Password Reset Pending",
          description: `${user.username} will need a delivered reset email before choosing a new password.`,
        }));
      }

      if (shouldOpenManagedUserSmtpPreview({
        deliveryMode: reset?.deliveryMode,
        previewUrl,
        sent: reset?.sent,
      })) {
        openManagedSecretDialog({
          title: "Password Reset Email Preview",
          description: `Email delivery is configured with a preview URL. The password reset link expires on ${expiresAt}.`,
          value: previewUrl,
        });
      }

      await Promise.all([loadManagedUsers(), loadPendingResetRequests(), loadDevMailOutbox()]);
    } catch (error: unknown) {
      const parsed = normalizeSettingsErrorPayload(error);
      toast(buildMutationErrorToast({
        title: parsed.code || "Reset Failed",
        error,
        fallbackDescription: parsed.message,
      }));
    } finally {
      resetPasswordLocksRef.current.delete(normalizedId);
    }
  }, [loadDevMailOutbox, loadManagedUsers, loadPendingResetRequests, openManagedSecretDialog, toast]);

  const handleResendManagedUserActivation = useCallback(async (user: ManagedUser) => {
    const normalizedId = normalizeManagedUserLifecycleTargetId(user.id);
    if (!normalizedId || resendActivationLocksRef.current.has(normalizedId)) {
      return;
    }

    resendActivationLocksRef.current.add(normalizedId);
    try {
      const response = await resendManagedUserActivation(normalizedId);
      const activation = response.activation;
      const recipientEmail = resolveManagedUserDeliveryRecipient(user, activation?.recipientEmail);
      const expiresAt = formatActivationExpiry(activation?.expiresAt);
      const previewUrl = getManagedUserDeliveryPreviewUrl(activation?.previewUrl);

      if (isDevOutboxActivation(activation)) {
        toast(buildMutationSuccessToast({
          title: "Activation Reissued",
          description: `Activation email for ${user.username} was captured in the local development outbox.`,
        }));
        openManagedSecretDialog({
          title: "Local Activation Email Preview",
          description: `SMTP is not configured, so the reissued activation email was written to the local development outbox instead. Open this preview URL and follow the activation link before ${expiresAt}.`,
          value: previewUrl,
        });
      } else if (activation?.sent) {
        toast(buildMutationSuccessToast({
          title: "Activation Reissued",
          description: `Activation email resent to ${recipientEmail || user.username}.`,
        }));
      } else {
        openManagedSecretDialog({
          title: "Activation Email Not Sent",
          description:
            activation?.errorMessage
              ? `The activation email could not be resent: ${activation.errorMessage}. The account remains pending activation until delivery succeeds.`
              : "The activation email could not be resent. The account remains pending activation until delivery succeeds.",
          value: previewUrl || undefined,
        });
        toast(buildMutationErrorToast({
          title: "Activation Still Pending",
          description: `${user.username} remains pending activation until the email is delivered.`,
        }));
      }

      if (shouldOpenManagedUserSmtpPreview({
        deliveryMode: activation?.deliveryMode,
        previewUrl,
        sent: activation?.sent,
      })) {
        openManagedSecretDialog({
          title: "Activation Email Preview",
          description: `Email delivery is configured with a preview URL. The activation link expires on ${expiresAt}.`,
          value: previewUrl,
        });
      }

      await Promise.all([loadManagedUsers(), loadDevMailOutbox()]);
    } catch (error: unknown) {
      const parsed = normalizeSettingsErrorPayload(error);
      toast(buildMutationErrorToast({
        title: parsed.code || "Activation Failed",
        error,
        fallbackDescription: parsed.message,
      }));
    } finally {
      resendActivationLocksRef.current.delete(normalizedId);
    }
  }, [loadDevMailOutbox, loadManagedUsers, openManagedSecretDialog, toast]);

  return {
    handleResendManagedUserActivation,
    handleResetManagedUserPassword,
  };
}

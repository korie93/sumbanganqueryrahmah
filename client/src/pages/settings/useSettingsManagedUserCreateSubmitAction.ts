import { useCallback, useRef, useState } from "react";
import { createManagedUserAccount } from "@/lib/api";
import {
  buildMutationErrorToast,
  buildMutationSuccessToast,
} from "@/lib/mutation-feedback";
import {
  formatActivationExpiry,
  isDevOutboxActivation,
} from "@/pages/settings/useSettingsManagedUserMutationShared";
import type { UseSettingsManagedUserCreateArgs } from "@/pages/settings/settings-managed-user-create-shared";
import {
  findDuplicateManagedUser,
  normalizeManagedUserCreateDraft,
  validateManagedUserCreateDraft,
} from "@/pages/settings/settings-managed-user-create-utils";
import {
  getManagedUserDeliveryPreviewUrl,
  resolveManagedUserDeliveryRecipient,
  shouldOpenManagedUserSmtpPreview,
} from "@/pages/settings/settings-managed-user-lifecycle-utils";
import { normalizeSettingsErrorPayload } from "@/pages/settings/utils";

type UseSettingsManagedUserCreateSubmitActionArgs = UseSettingsManagedUserCreateArgs & {
  createDraft: Parameters<typeof validateManagedUserCreateDraft>[0];
  resetCreateManagedUserForm: () => void;
};

export function useSettingsManagedUserCreateSubmitAction({
  createDraft,
  isMountedRef,
  loadDevMailOutbox,
  loadManagedUsers,
  openManagedSecretDialog,
  resetCreateManagedUserForm,
  toast,
}: UseSettingsManagedUserCreateSubmitActionArgs) {
  const createManagedUserLockRef = useRef(false);
  const [creatingManagedUser, setCreatingManagedUser] = useState(false);

  const handleCreateManagedUser = useCallback(async () => {
    if (creatingManagedUser || createManagedUserLockRef.current) {
      return;
    }

    const validationError = validateManagedUserCreateDraft(createDraft);
    if (validationError) {
      toast({
        title: "Validation Error",
        description: validationError,
        variant: "destructive",
      });
      return;
    }

    const normalizedDraft = normalizeManagedUserCreateDraft(createDraft);

    createManagedUserLockRef.current = true;
    setCreatingManagedUser(true);

    try {
      const response = await createManagedUserAccount({
        email: normalizedDraft.normalizedEmail || null,
        fullName: normalizedDraft.normalizedFullName || null,
        role: normalizedDraft.role,
        username: normalizedDraft.normalizedUsername,
      });
      const activation = response.activation;
      const recipientEmail = resolveManagedUserDeliveryRecipient(
        {
          email: normalizedDraft.normalizedEmail,
          username: normalizedDraft.normalizedUsername,
        } as never,
        activation?.recipientEmail,
      );
      const expiresAt = formatActivationExpiry(activation?.expiresAt);
      const previewUrl = getManagedUserDeliveryPreviewUrl(activation?.previewUrl);

      if (isDevOutboxActivation(activation)) {
        toast(buildMutationSuccessToast({
          title: "Account Created",
          description: `Created ${normalizedDraft.role} account for ${normalizedDraft.normalizedUsername}. Activation email was captured in the local development outbox.`,
        }));
        openManagedSecretDialog({
          title: "Local Activation Email Preview",
          description: `SMTP is not configured, so the activation email was written to the local development outbox instead. Open this preview URL and follow the activation link before ${expiresAt}.`,
          value: previewUrl,
        });
      } else if (activation?.sent) {
        toast(buildMutationSuccessToast({
          title: "Account Created",
          description: `Created ${normalizedDraft.role} account for ${normalizedDraft.normalizedUsername}. Activation email sent to ${recipientEmail}.`,
        }));
      } else {
        openManagedSecretDialog({
          title: "Activation Email Not Sent",
          description:
            activation?.errorMessage
              ? `The account was created and remains pending activation, but email delivery failed: ${activation.errorMessage}. Configure SMTP and use Resend Activation.`
              : "The account was created and remains pending activation, but the activation email could not be sent. Configure SMTP and use Resend Activation.",
          value: previewUrl || undefined,
        });
        toast(buildMutationSuccessToast({
          title: "Account Created",
          description: `${normalizedDraft.normalizedUsername} remains pending activation until the email is delivered.`,
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

      if (!isMountedRef.current) {
        return;
      }

      resetCreateManagedUserForm();
      await Promise.all([loadManagedUsers(), loadDevMailOutbox()]);
    } catch (error: unknown) {
      const parsed = normalizeSettingsErrorPayload(error);
      if (parsed.code === "USERNAME_TAKEN" || parsed.code === "INVALID_EMAIL") {
        const latestManagedUsers = (await loadManagedUsers()) ?? [];
        const duplicate = findDuplicateManagedUser({
          normalizedEmail: normalizedDraft.normalizedEmail,
          normalizedUsername: normalizedDraft.normalizedUsername,
          users: latestManagedUsers,
        });

        if (duplicate) {
          openManagedSecretDialog({
            title: "Account Already Exists",
            description:
              duplicate.status === "pending_activation"
                ? `${duplicate.username} already exists and is still pending activation. Use Resend Activation after SMTP is configured.`
                : `${duplicate.username} already exists in the system.`,
          });
          return;
        }
      }

      toast(buildMutationErrorToast({
        title: parsed.code || "Create Failed",
        error,
        fallbackDescription: parsed.message,
      }));
    } finally {
      createManagedUserLockRef.current = false;
      if (!isMountedRef.current) {
        return;
      }
      setCreatingManagedUser(false);
    }
  }, [
    createDraft,
    creatingManagedUser,
    isMountedRef,
    loadDevMailOutbox,
    loadManagedUsers,
    openManagedSecretDialog,
    resetCreateManagedUserForm,
    toast,
  ]);

  return {
    creatingManagedUser,
    handleCreateManagedUser,
  };
}

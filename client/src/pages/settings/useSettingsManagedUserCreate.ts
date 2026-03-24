import { useCallback, useRef, useState, type MutableRefObject } from "react";
import { createManagedUserAccount } from "@/lib/api";
import {
  buildMutationErrorToast,
  buildMutationSuccessToast,
} from "@/lib/mutation-feedback";
import type { ManagedUser } from "@/pages/settings/types";
import {
  formatActivationExpiry,
  isDevOutboxActivation,
  type ManagedSecretDialogParams,
  type ToastFn,
} from "@/pages/settings/useSettingsManagedUserMutationShared";
import {
  CREDENTIAL_USERNAME_REGEX,
  normalizeSettingsErrorPayload,
} from "@/pages/settings/utils";

type UseSettingsManagedUserCreateArgs = {
  isMountedRef: MutableRefObject<boolean>;
  loadDevMailOutbox: () => Promise<unknown>;
  loadManagedUsers: () => Promise<ManagedUser[] | undefined>;
  openManagedSecretDialog: (params: ManagedSecretDialogParams) => void;
  toast: ToastFn;
};

export function useSettingsManagedUserCreate({
  isMountedRef,
  loadDevMailOutbox,
  loadManagedUsers,
  openManagedSecretDialog,
  toast,
}: UseSettingsManagedUserCreateArgs) {
  const createManagedUserLockRef = useRef(false);

  const [createFullNameInput, setCreateFullNameInput] = useState("");
  const [createUsernameInput, setCreateUsernameInput] = useState("");
  const [createEmailInput, setCreateEmailInput] = useState("");
  const [createRoleInput, setCreateRoleInput] = useState<"admin" | "user">("user");
  const [creatingManagedUser, setCreatingManagedUser] = useState(false);

  const handleCreateManagedUser = useCallback(async () => {
    if (creatingManagedUser || createManagedUserLockRef.current) return;

    const normalizedUsername = createUsernameInput.trim().toLowerCase();
    const normalizedEmail = createEmailInput.trim().toLowerCase();

    if (!CREDENTIAL_USERNAME_REGEX.test(normalizedUsername)) {
      toast({
        title: "Validation Error",
        description: "Username must match ^[a-zA-Z0-9._-]{3,32}$.",
        variant: "destructive",
      });
      return;
    }

    if (!normalizedEmail) {
      toast({
        title: "Validation Error",
        description: "Email is required for account activation.",
        variant: "destructive",
      });
      return;
    }

    createManagedUserLockRef.current = true;
    setCreatingManagedUser(true);
    try {
      const response = await createManagedUserAccount({
        username: normalizedUsername,
        fullName: createFullNameInput.trim() || null,
        email: normalizedEmail || null,
        role: createRoleInput,
      });
      const activation = response.activation;
      const recipientEmail = String(activation?.recipientEmail || normalizedEmail);
      const expiresAt = formatActivationExpiry(activation?.expiresAt);
      const previewUrl = String(activation?.previewUrl || "");

      if (isDevOutboxActivation(activation)) {
        toast(buildMutationSuccessToast({
          title: "Account Created",
          description: `Created ${createRoleInput} account for ${normalizedUsername}. Activation email was captured in the local development outbox.`,
        }));
        openManagedSecretDialog({
          title: "Local Activation Email Preview",
          description: `SMTP is not configured, so the activation email was written to the local development outbox instead. Open this preview URL and follow the activation link before ${expiresAt}.`,
          value: previewUrl,
        });
      } else if (activation?.sent) {
        toast(buildMutationSuccessToast({
          title: "Account Created",
          description: `Created ${createRoleInput} account for ${normalizedUsername}. Activation email sent to ${recipientEmail}.`,
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
          description: `${normalizedUsername} remains pending activation until the email is delivered.`,
        }));
      }

      if (previewUrl && activation?.sent && activation?.deliveryMode === "smtp") {
        openManagedSecretDialog({
          title: "Activation Email Preview",
          description: `Email delivery is configured with a preview URL. The activation link expires on ${expiresAt}.`,
          value: previewUrl,
        });
      }

      if (!isMountedRef.current) return;
      setCreateFullNameInput("");
      setCreateUsernameInput("");
      setCreateEmailInput("");
      setCreateRoleInput("user");
      await Promise.all([loadManagedUsers(), loadDevMailOutbox()]);
    } catch (error: unknown) {
      const parsed = normalizeSettingsErrorPayload(error);
      if (parsed.code === "USERNAME_TAKEN" || parsed.code === "INVALID_EMAIL") {
        const latestManagedUsers = (await loadManagedUsers()) ?? [];
        const duplicate = latestManagedUsers.find((user) => {
          const sameUsername = user.username.toLowerCase() === normalizedUsername;
          const sameEmail =
            normalizedEmail !== ""
              && String(user.email || "").trim().toLowerCase() === normalizedEmail;
          return sameUsername || sameEmail;
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
      if (!isMountedRef.current) return;
      setCreatingManagedUser(false);
    }
  }, [
    createEmailInput,
    createFullNameInput,
    createRoleInput,
    createUsernameInput,
    creatingManagedUser,
    isMountedRef,
    loadDevMailOutbox,
    loadManagedUsers,
    openManagedSecretDialog,
    toast,
  ]);

  return {
    createEmailInput,
    createFullNameInput,
    createRoleInput,
    createUsernameInput,
    creatingManagedUser,
    handleCreateManagedUser,
    setCreateEmailInput,
    setCreateFullNameInput,
    setCreateRoleInput,
    setCreateUsernameInput,
  };
}

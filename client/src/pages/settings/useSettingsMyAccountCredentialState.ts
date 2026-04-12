import { useCallback, useState } from "react";
import { updateMyCredentials } from "@/lib/api";
import {
  buildMutationSuccessToast,
} from "@/lib/mutation-feedback";
import {
  type SyncCurrentUserFn,
  type UseSettingsMyAccountArgs,
} from "@/pages/settings/settings-my-account-shared";
import { buildNextCurrentUser } from "@/pages/settings/settings-my-account-utils";
import type { CurrentUser } from "@/pages/settings/types";
import {
  buildSettingsMutationErrorToast,
  isStrongPassword,
} from "@/pages/settings/utils";
import {
  normalizeCredentialUsername,
  validateCredentialUsername,
} from "@/pages/settings/settings-credential-validation";

type UseSettingsMyAccountCredentialStateArgs = UseSettingsMyAccountArgs & {
  currentUser: CurrentUser | null;
  forceLogoutAfterPasswordChange: () => void;
  syncCurrentUser: SyncCurrentUserFn;
};

export function useSettingsMyAccountCredentialState({
  currentUser,
  forceLogoutAfterPasswordChange,
  isMountedRef,
  syncCurrentUser,
  toast,
}: UseSettingsMyAccountCredentialStateArgs) {
  const [usernameInput, setUsernameInput] = useState("");
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [currentPasswordInput, setCurrentPasswordInput] = useState("");
  const [newPasswordInput, setNewPasswordInput] = useState("");
  const [confirmPasswordInput, setConfirmPasswordInput] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  const handleChangeUsername = useCallback(async () => {
    if (!currentUser || usernameSaving) return;
    const normalized = normalizeCredentialUsername(usernameInput);

    const usernameValidationError = validateCredentialUsername(normalized);
    if (usernameValidationError) {
      toast({
        title: "Validation Error",
        description: usernameValidationError,
        variant: "destructive",
      });
      return;
    }

    if (normalized === currentUser.username) {
      toast({ title: "No Changes", description: "Username is unchanged." });
      return;
    }

    setUsernameSaving(true);
    try {
      const response = await updateMyCredentials({ newUsername: normalized });
      const nextUser = buildNextCurrentUser(currentUser, normalized, response);

      if (!isMountedRef.current) return;
      syncCurrentUser(nextUser);
      setUsernameInput(nextUser.username);

      toast(buildMutationSuccessToast({
        title: "Username Updated",
        description: "Your username has been updated successfully.",
      }));
    } catch (error: unknown) {
      toast(buildSettingsMutationErrorToast(error, "Update Failed"));
    } finally {
      if (!isMountedRef.current) return;
      setUsernameSaving(false);
    }
  }, [currentUser, isMountedRef, syncCurrentUser, toast, usernameInput, usernameSaving]);

  const handleChangePassword = useCallback(async () => {
    if (!currentUser || passwordSaving) return;

    if (!currentPasswordInput) {
      toast({
        title: "Validation Error",
        description: "Current password is required.",
        variant: "destructive",
      });
      return;
    }

    if (!isStrongPassword(newPasswordInput)) {
      toast({
        title: "Validation Error",
        description:
          "New password must be at least 8 characters and include at least one letter and one number.",
        variant: "destructive",
      });
      return;
    }

    if (newPasswordInput !== confirmPasswordInput) {
      toast({
        title: "Validation Error",
        description: "Confirm password does not match.",
        variant: "destructive",
      });
      return;
    }

    setPasswordSaving(true);
    try {
      const response = await updateMyCredentials({
        currentPassword: currentPasswordInput,
        newPassword: newPasswordInput,
      });

      if (!isMountedRef.current) return;
      setCurrentPasswordInput("");
      setNewPasswordInput("");
      setConfirmPasswordInput("");

      toast(buildMutationSuccessToast({
        title: "Password Updated",
        description: "Password changed successfully. You will need to login again.",
      }));

      if (response?.forceLogout) {
        forceLogoutAfterPasswordChange();
      }
    } catch (error: unknown) {
      toast(buildSettingsMutationErrorToast(error, "Update Failed"));
    } finally {
      if (!isMountedRef.current) return;
      setPasswordSaving(false);
    }
  }, [
    confirmPasswordInput,
    currentPasswordInput,
    currentUser,
    forceLogoutAfterPasswordChange,
    isMountedRef,
    newPasswordInput,
    passwordSaving,
    toast,
  ]);

  return {
    confirmPasswordInput,
    currentPasswordInput,
    handleChangePassword,
    handleChangeUsername,
    newPasswordInput,
    passwordSaving,
    setConfirmPasswordInput,
    setCurrentPasswordInput,
    setNewPasswordInput,
    setUsernameInput,
    usernameInput,
    usernameSaving,
  };
}

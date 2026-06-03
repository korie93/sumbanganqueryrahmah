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
import { getCredentialPasswordPolicyMessage } from "@shared/password-policy";
import {
  normalizeCredentialUsername,
  validateCredentialUsername,
} from "@/pages/settings/settings-credential-validation";

type UseSettingsMyAccountCredentialStateArgs = UseSettingsMyAccountArgs & {
  currentUser: CurrentUser | null;
  forceLogoutAfterPasswordChange: () => void;
  syncCurrentUser: SyncCurrentUserFn;
};

function validateCurrentPasswordInput(value: string): string | null {
  return value ? null : "Current password is required.";
}

function validateNewPasswordInput(value: string): string | null {
  return isStrongPassword(value) ? null : getCredentialPasswordPolicyMessage();
}

function validateConfirmPasswordInput(newPassword: string, confirmPassword: string): string | null {
  return newPassword === confirmPassword ? null : "Confirm password does not match.";
}

export function useSettingsMyAccountCredentialState({
  currentUser,
  forceLogoutAfterPasswordChange,
  isMountedRef,
  syncCurrentUser,
  toast,
}: UseSettingsMyAccountCredentialStateArgs) {
  const [usernameInput, setUsernameInputState] = useState("");
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [currentPasswordInput, setCurrentPasswordInputState] = useState("");
  const [currentPasswordError, setCurrentPasswordError] = useState<string | null>(null);
  const [newPasswordInput, setNewPasswordInputState] = useState("");
  const [newPasswordError, setNewPasswordError] = useState<string | null>(null);
  const [confirmPasswordInput, setConfirmPasswordInputState] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);

  const setUsernameInput = useCallback((value: string) => {
    setUsernameInputState(value);
    setUsernameError(null);
  }, []);

  const setCurrentPasswordInput = useCallback((value: string) => {
    setCurrentPasswordInputState(value);
    setCurrentPasswordError(null);
  }, []);

  const setNewPasswordInput = useCallback((value: string) => {
    setNewPasswordInputState(value);
    setNewPasswordError(null);
    if (confirmPasswordInput) {
      setConfirmPasswordError(validateConfirmPasswordInput(value, confirmPasswordInput));
    }
  }, [confirmPasswordInput]);

  const setConfirmPasswordInput = useCallback((value: string) => {
    setConfirmPasswordInputState(value);
    setConfirmPasswordError(null);
  }, []);

  const handleUsernameBlur = useCallback(() => {
    setUsernameError(validateCredentialUsername(normalizeCredentialUsername(usernameInput)));
  }, [usernameInput]);

  const handleCurrentPasswordBlur = useCallback(() => {
    setCurrentPasswordError(validateCurrentPasswordInput(currentPasswordInput));
  }, [currentPasswordInput]);

  const handleNewPasswordBlur = useCallback(() => {
    setNewPasswordError(validateNewPasswordInput(newPasswordInput));
    if (confirmPasswordInput) {
      setConfirmPasswordError(validateConfirmPasswordInput(newPasswordInput, confirmPasswordInput));
    }
  }, [confirmPasswordInput, newPasswordInput]);

  const handleConfirmPasswordBlur = useCallback(() => {
    setConfirmPasswordError(validateConfirmPasswordInput(newPasswordInput, confirmPasswordInput));
  }, [confirmPasswordInput, newPasswordInput]);

  const handleChangeUsername = useCallback(async () => {
    if (!currentUser || usernameSaving) return;
    const normalized = normalizeCredentialUsername(usernameInput);

    const usernameValidationError = validateCredentialUsername(normalized);
    if (usernameValidationError) {
      setUsernameError(usernameValidationError);
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
      setUsernameError(null);

      toast(buildMutationSuccessToast({
        title: "Username Updated",
        description: "Your username has been updated successfully.",
      }));
    } catch (error: unknown) {
      toast(buildSettingsMutationErrorToast(error, "Update Failed"));
    } finally {
      if (isMountedRef.current) {
        setUsernameSaving(false);
      }
    }
  }, [currentUser, isMountedRef, syncCurrentUser, toast, usernameInput, usernameSaving]);

  const handleChangePassword = useCallback(async () => {
    if (!currentUser || passwordSaving) return;

    const nextCurrentPasswordError = validateCurrentPasswordInput(currentPasswordInput);
    const nextNewPasswordError = validateNewPasswordInput(newPasswordInput);
    const nextConfirmPasswordError = validateConfirmPasswordInput(newPasswordInput, confirmPasswordInput);

    setCurrentPasswordError(nextCurrentPasswordError);
    setNewPasswordError(nextNewPasswordError);
    setConfirmPasswordError(nextConfirmPasswordError);

    const validationError =
      nextCurrentPasswordError ?? nextNewPasswordError ?? nextConfirmPasswordError;
    if (validationError) {
      toast({
        title: "Validation Error",
        description: validationError,
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
      setCurrentPasswordError(null);
      setNewPasswordError(null);
      setConfirmPasswordError(null);

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
      if (isMountedRef.current) {
        setPasswordSaving(false);
      }
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
    confirmPasswordError,
    currentPasswordInput,
    currentPasswordError,
    handleConfirmPasswordBlur,
    handleChangePassword,
    handleChangeUsername,
    handleCurrentPasswordBlur,
    handleNewPasswordBlur,
    handleUsernameBlur,
    newPasswordInput,
    newPasswordError,
    passwordSaving,
    setConfirmPasswordInput,
    setCurrentPasswordInput,
    setNewPasswordInput,
    setUsernameInput,
    usernameError,
    usernameInput,
    usernameSaving,
  };
}

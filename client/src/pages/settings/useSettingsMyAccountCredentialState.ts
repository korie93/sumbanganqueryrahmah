import { useCallback, useEffect, useRef, useState } from "react";
import { changeMyPassword } from "@/lib/api/auth";
import { getAuthErrorCode, getAuthErrorMessage } from "@/lib/auth-flow-feedback";
import { buildMutationSuccessToast } from "@/lib/mutation-feedback";
import type { UseSettingsMyAccountArgs } from "@/pages/settings/settings-my-account-shared";
import type { CurrentUser } from "@/pages/settings/types";
import { getCredentialPasswordValidationError } from "@shared/password-policy";

type UseSettingsMyAccountCredentialStateArgs = UseSettingsMyAccountArgs & {
  currentUser: CurrentUser | null;
  forceLogoutAfterPasswordChange: () => void;
  locale?: "ms" | "en";
};

const validateCurrentPassword = (value: string) => value ? null : "Current password is required.";
const validateNewPassword = (value: string, locale: "ms" | "en") => getCredentialPasswordValidationError(value, locale)?.message ?? null;
const validateConfirmation = (value: string, confirmation: string) =>
  value === confirmation ? null : "Confirm password does not match.";

// This is the original personal password state, now owned only by Security.
// Both legacy credential updates and the dedicated endpoint use changeOwnPassword
// on the server; use the dedicated endpoint so the payload cannot edit identity.
export function useSettingsMyAccountCredentialState({
  currentUser,
  forceLogoutAfterPasswordChange,
  isMountedRef,
  toast,
  locale = "ms",
}: UseSettingsMyAccountCredentialStateArgs) {
  const [currentPasswordInput, setCurrentPassword] = useState("");
  const [currentPasswordError, setCurrentPasswordError] = useState<string | null>(null);
  const [newPasswordInput, setNewPassword] = useState("");
  const [newPasswordError, setNewPasswordError] = useState<string | null>(null);
  const [confirmPasswordInput, setConfirmPassword] = useState("");
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);
  const [passwordActionError, setPasswordActionError] = useState<string | null>(null);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const accountKey = currentUser ? `${currentUser.id}:${currentUser.username}` : "";
  const accountKeyRef = useRef(accountKey);
  accountKeyRef.current = accountKey;

  const clearPasswordFields = useCallback(() => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setCurrentPasswordError(null);
    setNewPasswordError(null);
    setConfirmPasswordError(null);
    setPasswordActionError(null);
  }, []);

  useEffect(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    clearPasswordFields();
    setPasswordSaving(false);
    return () => {
      requestRef.current?.abort();
      requestRef.current = null;
    };
  }, [accountKey, clearPasswordFields]);

  const setCurrentPasswordInput = useCallback((value: string) => {
    setCurrentPassword(value);
    setCurrentPasswordError(null);
    setPasswordActionError(null);
  }, []);
  const setNewPasswordInput = useCallback((value: string) => {
    setNewPassword(value);
    setNewPasswordError(null);
    setPasswordActionError(null);
    if (confirmPasswordInput) setConfirmPasswordError(validateConfirmation(value, confirmPasswordInput));
  }, [confirmPasswordInput]);
  const setConfirmPasswordInput = useCallback((value: string) => {
    setConfirmPassword(value);
    setConfirmPasswordError(null);
    setPasswordActionError(null);
  }, []);

  const handleChangePassword = useCallback(async () => {
    // A synchronous lock prevents repeat submissions before React re-renders.
    if (!currentUser || requestRef.current || accountKeyRef.current !== accountKey) return;
    const currentError = validateCurrentPassword(currentPasswordInput);
    const newError = validateNewPassword(newPasswordInput, locale);
    const confirmationError = validateConfirmation(newPasswordInput, confirmPasswordInput);
    setCurrentPasswordError(currentError);
    setNewPasswordError(newError);
    setConfirmPasswordError(confirmationError);
    setPasswordActionError(null);
    if (currentError || newError || confirmationError) return;

    const controller = new AbortController();
    requestRef.current = controller;
    setPasswordSaving(true);
    const isCurrent = () => isMountedRef.current && !controller.signal.aborted
      && requestRef.current === controller && accountKeyRef.current === accountKey;
    try {
      const response = await changeMyPassword({
        currentPassword: currentPasswordInput,
        newPassword: newPasswordInput,
      }, { signal: controller.signal });
      if (!isCurrent()) return;
      clearPasswordFields();
      toast(buildMutationSuccessToast({
        title: "Password Updated",
        description: response.forceLogout
          ? "Password changed successfully. Please login again."
          : "Password changed successfully.",
      }));
      if (response.forceLogout) forceLogoutAfterPasswordChange();
    } catch (error: unknown) {
      if (!isCurrent()) return;
      const message = getAuthErrorMessage(error, "Password could not be changed. Please try again.", undefined, locale);
      const code = getAuthErrorCode(error);
      if (code === "INVALID_CURRENT_PASSWORD") setCurrentPasswordError(message);
      else if (code === "INVALID_PASSWORD") setNewPasswordError(message);
      else setPasswordActionError(message);
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        if (isMountedRef.current && accountKeyRef.current === accountKey) setPasswordSaving(false);
      }
    }
  }, [accountKey, clearPasswordFields, confirmPasswordInput, currentPasswordInput, currentUser,
    forceLogoutAfterPasswordChange, isMountedRef, locale, newPasswordInput, toast]);

  return {
    clearPasswordFields,
    confirmPasswordInput,
    confirmPasswordError,
    currentPasswordInput,
    currentPasswordError,
    handleConfirmPasswordBlur: () => setConfirmPasswordError(validateConfirmation(newPasswordInput, confirmPasswordInput)),
    handleCurrentPasswordBlur: () => setCurrentPasswordError(validateCurrentPassword(currentPasswordInput)),
    handleNewPasswordBlur: () => {
      setNewPasswordError(validateNewPassword(newPasswordInput, locale));
      if (confirmPasswordInput) setConfirmPasswordError(validateConfirmation(newPasswordInput, confirmPasswordInput));
    },
    handleChangePassword,
    newPasswordInput,
    newPasswordError,
    passwordActionError,
    passwordSaving,
    setConfirmPasswordInput,
    setCurrentPasswordInput,
    setNewPasswordInput,
  };
}

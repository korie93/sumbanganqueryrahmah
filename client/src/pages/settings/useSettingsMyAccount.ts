import { useCallback, useState } from "react";
import {
  type UseSettingsMyAccountArgs,
} from "@/pages/settings/settings-my-account-shared";
import {
  forceLogoutAfterPasswordChange,
  syncSettingsCurrentUser,
} from "@/pages/settings/settings-my-account-utils";
import { useSettingsMyAccountCredentialState } from "@/pages/settings/useSettingsMyAccountCredentialState";
import { useSettingsMyAccountTwoFactorState } from "@/pages/settings/useSettingsMyAccountTwoFactorState";
import type { CurrentUser } from "@/pages/settings/types";

export function useSettingsMyAccount({
  isMountedRef,
  toast,
}: UseSettingsMyAccountArgs) {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  const syncCurrentUser = useCallback((nextUser: CurrentUser) => {
    setCurrentUser(nextUser);
    syncSettingsCurrentUser(nextUser);
  }, []);

  const credentials = useSettingsMyAccountCredentialState({
    currentUser,
    forceLogoutAfterPasswordChange,
    isMountedRef,
    syncCurrentUser,
    toast,
  });
  const twoFactor = useSettingsMyAccountTwoFactorState({
    currentUser,
    isMountedRef,
    syncCurrentUser,
    toast,
  });
  const { setUsernameInput } = credentials;

  const hydrateCurrentUser = useCallback((nextUser: CurrentUser) => {
    setCurrentUser(nextUser);
    setUsernameInput(nextUser.username);
  }, [setUsernameInput]);

  return {
    confirmPasswordInput: credentials.confirmPasswordInput,
    confirmPasswordError: credentials.confirmPasswordError,
    currentPasswordInput: credentials.currentPasswordInput,
    currentPasswordError: credentials.currentPasswordError,
    currentUser,
    handleConfirmPasswordBlur: credentials.handleConfirmPasswordBlur,
    handleDisableTwoFactor: twoFactor.handleDisableTwoFactor,
    handleEnableTwoFactor: twoFactor.handleEnableTwoFactor,
    handleChangePassword: credentials.handleChangePassword,
    handleChangeUsername: credentials.handleChangeUsername,
    handleCurrentPasswordBlur: credentials.handleCurrentPasswordBlur,
    handleNewPasswordBlur: credentials.handleNewPasswordBlur,
    handleStartTwoFactorSetup: twoFactor.handleStartTwoFactorSetup,
    handleTwoFactorCodeBlur: twoFactor.handleTwoFactorCodeBlur,
    handleTwoFactorPasswordBlur: twoFactor.handleTwoFactorPasswordBlur,
    handleUsernameBlur: credentials.handleUsernameBlur,
    hydrateCurrentUser,
    newPasswordInput: credentials.newPasswordInput,
    newPasswordError: credentials.newPasswordError,
    passwordSaving: credentials.passwordSaving,
    setConfirmPasswordInput: credentials.setConfirmPasswordInput,
    setCurrentPasswordInput: credentials.setCurrentPasswordInput,
    setNewPasswordInput: credentials.setNewPasswordInput,
    setTwoFactorCodeInput: twoFactor.setTwoFactorCodeInput,
    setTwoFactorPasswordInput: twoFactor.setTwoFactorPasswordInput,
    setUsernameInput: credentials.setUsernameInput,
    twoFactorCodeError: twoFactor.twoFactorCodeError,
    twoFactorCodeInput: twoFactor.twoFactorCodeInput,
    twoFactorLoading: twoFactor.twoFactorLoading,
    twoFactorPasswordError: twoFactor.twoFactorPasswordError,
    twoFactorPasswordInput: twoFactor.twoFactorPasswordInput,
    twoFactorSetupAccountName: twoFactor.twoFactorSetupAccountName,
    twoFactorSetupIssuer: twoFactor.twoFactorSetupIssuer,
    twoFactorSetupSecret: twoFactor.twoFactorSetupSecret,
    twoFactorSetupUri: twoFactor.twoFactorSetupUri,
    usernameError: credentials.usernameError,
    usernameInput: credentials.usernameInput,
    usernameSaving: credentials.usernameSaving,
  };
}

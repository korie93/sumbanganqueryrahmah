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

  const hydrateCurrentUser = useCallback((nextUser: CurrentUser) => {
    setCurrentUser(nextUser);
    credentials.setUsernameInput(nextUser.username);
  }, [credentials.setUsernameInput]);

  return {
    confirmPasswordInput: credentials.confirmPasswordInput,
    currentPasswordInput: credentials.currentPasswordInput,
    currentUser,
    handleDisableTwoFactor: twoFactor.handleDisableTwoFactor,
    handleEnableTwoFactor: twoFactor.handleEnableTwoFactor,
    handleChangePassword: credentials.handleChangePassword,
    handleChangeUsername: credentials.handleChangeUsername,
    handleStartTwoFactorSetup: twoFactor.handleStartTwoFactorSetup,
    hydrateCurrentUser,
    newPasswordInput: credentials.newPasswordInput,
    passwordSaving: credentials.passwordSaving,
    setConfirmPasswordInput: credentials.setConfirmPasswordInput,
    setCurrentPasswordInput: credentials.setCurrentPasswordInput,
    setNewPasswordInput: credentials.setNewPasswordInput,
    setTwoFactorCodeInput: twoFactor.setTwoFactorCodeInput,
    setTwoFactorPasswordInput: twoFactor.setTwoFactorPasswordInput,
    setUsernameInput: credentials.setUsernameInput,
    twoFactorCodeInput: twoFactor.twoFactorCodeInput,
    twoFactorLoading: twoFactor.twoFactorLoading,
    twoFactorPasswordInput: twoFactor.twoFactorPasswordInput,
    twoFactorSetupAccountName: twoFactor.twoFactorSetupAccountName,
    twoFactorSetupIssuer: twoFactor.twoFactorSetupIssuer,
    twoFactorSetupSecret: twoFactor.twoFactorSetupSecret,
    twoFactorSetupUri: twoFactor.twoFactorSetupUri,
    usernameInput: credentials.usernameInput,
    usernameSaving: credentials.usernameSaving,
  };
}

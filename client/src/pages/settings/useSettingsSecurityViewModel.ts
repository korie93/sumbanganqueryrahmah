import { useMemo } from "react";
import { buildSettingsSecurityViewModel } from "@/pages/settings/settings-controller-view-models";

type UseSettingsSecurityViewModelArgs = {
  canAccessAccountSecurity: boolean;
  confirmPasswordInput: string;
  currentPasswordInput: string;
  currentUserRole: string;
  handleChangePassword: () => Promise<void>;
  handleChangeUsername: () => Promise<void>;
  handleDisableTwoFactor: () => Promise<void>;
  handleEnableTwoFactor: () => Promise<void>;
  handleStartTwoFactorSetup: () => Promise<void>;
  isSecurityCategory: boolean;
  newPasswordInput: string;
  passwordSaving: boolean;
  setConfirmPasswordInput: (value: string) => void;
  setCurrentPasswordInput: (value: string) => void;
  setNewPasswordInput: (value: string) => void;
  setTwoFactorCodeInput: (value: string) => void;
  setTwoFactorPasswordInput: (value: string) => void;
  setUsernameInput: (value: string) => void;
  twoFactorCodeInput: string;
  twoFactorEnabled: boolean;
  twoFactorLoading: boolean;
  twoFactorPasswordInput: string;
  twoFactorPendingSetup: boolean;
  twoFactorSetupAccountName: string;
  twoFactorSetupIssuer: string;
  twoFactorSetupSecret: string;
  twoFactorSetupUri: string;
  usernameInput: string;
  usernameSaving: boolean;
};

export function useSettingsSecurityViewModel({
  canAccessAccountSecurity,
  confirmPasswordInput,
  currentPasswordInput,
  currentUserRole,
  handleChangePassword,
  handleChangeUsername,
  handleDisableTwoFactor,
  handleEnableTwoFactor,
  handleStartTwoFactorSetup,
  isSecurityCategory,
  newPasswordInput,
  passwordSaving,
  setConfirmPasswordInput,
  setCurrentPasswordInput,
  setNewPasswordInput,
  setTwoFactorCodeInput,
  setTwoFactorPasswordInput,
  setUsernameInput,
  twoFactorCodeInput,
  twoFactorEnabled,
  twoFactorLoading,
  twoFactorPasswordInput,
  twoFactorPendingSetup,
  twoFactorSetupAccountName,
  twoFactorSetupIssuer,
  twoFactorSetupSecret,
  twoFactorSetupUri,
  usernameInput,
  usernameSaving,
}: UseSettingsSecurityViewModelArgs) {
  return useMemo(() => {
    if (!(canAccessAccountSecurity && isSecurityCategory)) {
      return null;
    }

    return buildSettingsSecurityViewModel({
      confirmPasswordInput,
      currentPasswordInput,
      currentUserRole,
      newPasswordInput,
      onDisableTwoFactor: () => void handleDisableTwoFactor(),
      onEnableTwoFactor: () => void handleEnableTwoFactor(),
      onChangePassword: () => void handleChangePassword(),
      onChangeUsername: () => void handleChangeUsername(),
      onConfirmPasswordInputChange: setConfirmPasswordInput,
      onCurrentPasswordInputChange: setCurrentPasswordInput,
      onNewPasswordInputChange: setNewPasswordInput,
      onStartTwoFactorSetup: () => void handleStartTwoFactorSetup(),
      onTwoFactorCodeInputChange: setTwoFactorCodeInput,
      onTwoFactorPasswordInputChange: setTwoFactorPasswordInput,
      onUsernameInputChange: setUsernameInput,
      passwordSaving,
      twoFactorCodeInput,
      twoFactorEnabled,
      twoFactorLoading,
      twoFactorPasswordInput,
      twoFactorPendingSetup,
      twoFactorSetupAccountName,
      twoFactorSetupIssuer,
      twoFactorSetupSecret,
      twoFactorSetupUri,
      usernameInput,
      usernameSaving,
    });
  }, [
    canAccessAccountSecurity,
    confirmPasswordInput,
    currentPasswordInput,
    currentUserRole,
    handleChangePassword,
    handleChangeUsername,
    handleDisableTwoFactor,
    handleEnableTwoFactor,
    handleStartTwoFactorSetup,
    isSecurityCategory,
    newPasswordInput,
    passwordSaving,
    setConfirmPasswordInput,
    setCurrentPasswordInput,
    setNewPasswordInput,
    setTwoFactorCodeInput,
    setTwoFactorPasswordInput,
    setUsernameInput,
    twoFactorCodeInput,
    twoFactorEnabled,
    twoFactorLoading,
    twoFactorPasswordInput,
    twoFactorPendingSetup,
    twoFactorSetupAccountName,
    twoFactorSetupIssuer,
    twoFactorSetupSecret,
    twoFactorSetupUri,
    usernameInput,
    usernameSaving,
  ]);
}

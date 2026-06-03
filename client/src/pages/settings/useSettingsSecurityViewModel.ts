import { useMemo } from "react";
import { buildSettingsSecurityViewModel } from "@/pages/settings/settings-controller-view-models";

type UseSettingsSecurityViewModelArgs = {
  canAccessAccountSecurity: boolean;
  confirmPasswordInput: string;
  confirmPasswordError: string | null;
  currentPasswordInput: string;
  currentPasswordError: string | null;
  currentUserRole: string;
  handleConfirmPasswordBlur: () => void;
  handleChangePassword: () => Promise<void>;
  handleChangeUsername: () => Promise<void>;
  handleCurrentPasswordBlur: () => void;
  handleDisableTwoFactor: () => Promise<void>;
  handleEnableTwoFactor: () => Promise<void>;
  handleNewPasswordBlur: () => void;
  handleStartTwoFactorSetup: () => Promise<void>;
  handleTwoFactorCodeBlur: () => void;
  handleTwoFactorPasswordBlur: () => void;
  handleUsernameBlur: () => void;
  isSecurityCategory: boolean;
  newPasswordInput: string;
  newPasswordError: string | null;
  passwordSaving: boolean;
  setConfirmPasswordInput: (value: string) => void;
  setCurrentPasswordInput: (value: string) => void;
  setNewPasswordInput: (value: string) => void;
  setTwoFactorCodeInput: (value: string) => void;
  setTwoFactorPasswordInput: (value: string) => void;
  setUsernameInput: (value: string) => void;
  twoFactorCodeError: string | null;
  twoFactorCodeInput: string;
  twoFactorEnabled: boolean;
  twoFactorLoading: boolean;
  twoFactorPasswordError: string | null;
  twoFactorPasswordInput: string;
  twoFactorPendingSetup: boolean;
  twoFactorSetupAccountName: string;
  twoFactorSetupIssuer: string;
  twoFactorSetupSecret: string;
  twoFactorSetupUri: string;
  usernameError: string | null;
  usernameInput: string;
  usernameSaving: boolean;
};

export function useSettingsSecurityViewModel({
  canAccessAccountSecurity,
  confirmPasswordInput,
  confirmPasswordError,
  currentPasswordInput,
  currentPasswordError,
  currentUserRole,
  handleConfirmPasswordBlur,
  handleChangePassword,
  handleChangeUsername,
  handleCurrentPasswordBlur,
  handleDisableTwoFactor,
  handleEnableTwoFactor,
  handleNewPasswordBlur,
  handleStartTwoFactorSetup,
  handleTwoFactorCodeBlur,
  handleTwoFactorPasswordBlur,
  handleUsernameBlur,
  isSecurityCategory,
  newPasswordInput,
  newPasswordError,
  passwordSaving,
  setConfirmPasswordInput,
  setCurrentPasswordInput,
  setNewPasswordInput,
  setTwoFactorCodeInput,
  setTwoFactorPasswordInput,
  setUsernameInput,
  twoFactorCodeError,
  twoFactorCodeInput,
  twoFactorEnabled,
  twoFactorLoading,
  twoFactorPasswordError,
  twoFactorPasswordInput,
  twoFactorPendingSetup,
  twoFactorSetupAccountName,
  twoFactorSetupIssuer,
  twoFactorSetupSecret,
  twoFactorSetupUri,
  usernameError,
  usernameInput,
  usernameSaving,
}: UseSettingsSecurityViewModelArgs) {
  return useMemo(() => {
    if (!(canAccessAccountSecurity && isSecurityCategory)) {
      return null;
    }

    return buildSettingsSecurityViewModel({
      confirmPasswordInput,
      confirmPasswordError,
      currentPasswordInput,
      currentPasswordError,
      currentUserRole,
      newPasswordInput,
      newPasswordError,
      onDisableTwoFactor: () => void handleDisableTwoFactor(),
      onEnableTwoFactor: () => void handleEnableTwoFactor(),
      onChangePassword: () => void handleChangePassword(),
      onChangeUsername: () => void handleChangeUsername(),
      onConfirmPasswordBlur: handleConfirmPasswordBlur,
      onConfirmPasswordInputChange: setConfirmPasswordInput,
      onCurrentPasswordBlur: handleCurrentPasswordBlur,
      onCurrentPasswordInputChange: setCurrentPasswordInput,
      onNewPasswordBlur: handleNewPasswordBlur,
      onNewPasswordInputChange: setNewPasswordInput,
      onStartTwoFactorSetup: () => void handleStartTwoFactorSetup(),
      onTwoFactorCodeBlur: handleTwoFactorCodeBlur,
      onTwoFactorCodeInputChange: setTwoFactorCodeInput,
      onTwoFactorPasswordBlur: handleTwoFactorPasswordBlur,
      onTwoFactorPasswordInputChange: setTwoFactorPasswordInput,
      onUsernameBlur: handleUsernameBlur,
      onUsernameInputChange: setUsernameInput,
      passwordSaving,
      twoFactorCodeError,
      twoFactorCodeInput,
      twoFactorEnabled,
      twoFactorLoading,
      twoFactorPasswordError,
      twoFactorPasswordInput,
      twoFactorPendingSetup,
      twoFactorSetupAccountName,
      twoFactorSetupIssuer,
      twoFactorSetupSecret,
      twoFactorSetupUri,
      usernameError,
      usernameInput,
      usernameSaving,
    });
  }, [
    canAccessAccountSecurity,
    confirmPasswordInput,
    confirmPasswordError,
    currentPasswordInput,
    currentPasswordError,
    currentUserRole,
    handleConfirmPasswordBlur,
    handleChangePassword,
    handleChangeUsername,
    handleCurrentPasswordBlur,
    handleDisableTwoFactor,
    handleEnableTwoFactor,
    handleNewPasswordBlur,
    handleStartTwoFactorSetup,
    handleTwoFactorCodeBlur,
    handleTwoFactorPasswordBlur,
    handleUsernameBlur,
    isSecurityCategory,
    newPasswordInput,
    newPasswordError,
    passwordSaving,
    setConfirmPasswordInput,
    setCurrentPasswordInput,
    setNewPasswordInput,
    setTwoFactorCodeInput,
    setTwoFactorPasswordInput,
    setUsernameInput,
    twoFactorCodeError,
    twoFactorCodeInput,
    twoFactorEnabled,
    twoFactorLoading,
    twoFactorPasswordError,
    twoFactorPasswordInput,
    twoFactorPendingSetup,
    twoFactorSetupAccountName,
    twoFactorSetupIssuer,
    twoFactorSetupSecret,
    twoFactorSetupUri,
    usernameError,
    usernameInput,
    usernameSaving,
  ]);
}

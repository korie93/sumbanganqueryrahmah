import { MyAccountSecurityCard } from "@/pages/settings/MyAccountSecurityCard";

export interface AccountSecuritySectionProps {
  confirmPasswordInput: string;
  confirmPasswordError: string | null;
  currentPasswordInput: string;
  currentPasswordError: string | null;
  currentUserRole: string;
  newPasswordInput: string;
  newPasswordError: string | null;
  onDisableTwoFactor: () => void;
  onEnableTwoFactor: () => void;
  onChangePassword: () => void;
  onChangeUsername: () => void;
  onConfirmPasswordBlur: () => void;
  onConfirmPasswordInputChange: (value: string) => void;
  onCurrentPasswordBlur: () => void;
  onCurrentPasswordInputChange: (value: string) => void;
  onNewPasswordBlur: () => void;
  onNewPasswordInputChange: (value: string) => void;
  onStartTwoFactorSetup: () => void;
  onTwoFactorCodeBlur: () => void;
  onTwoFactorCodeInputChange: (value: string) => void;
  onTwoFactorPasswordBlur: () => void;
  onTwoFactorPasswordInputChange: (value: string) => void;
  onUsernameBlur: () => void;
  onUsernameInputChange: (value: string) => void;
  passwordSaving: boolean;
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
}

export function AccountSecuritySection(props: AccountSecuritySectionProps) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <MyAccountSecurityCard
        confirmPasswordInput={props.confirmPasswordInput}
        confirmPasswordError={props.confirmPasswordError}
        currentPasswordInput={props.currentPasswordInput}
        currentPasswordError={props.currentPasswordError}
        currentUserRole={props.currentUserRole}
        newPasswordInput={props.newPasswordInput}
        newPasswordError={props.newPasswordError}
        onDisableTwoFactor={props.onDisableTwoFactor}
        onEnableTwoFactor={props.onEnableTwoFactor}
        onChangePassword={props.onChangePassword}
        onChangeUsername={props.onChangeUsername}
        onConfirmPasswordBlur={props.onConfirmPasswordBlur}
        onConfirmPasswordInputChange={props.onConfirmPasswordInputChange}
        onCurrentPasswordBlur={props.onCurrentPasswordBlur}
        onCurrentPasswordInputChange={props.onCurrentPasswordInputChange}
        onNewPasswordBlur={props.onNewPasswordBlur}
        onNewPasswordInputChange={props.onNewPasswordInputChange}
        onStartTwoFactorSetup={props.onStartTwoFactorSetup}
        onTwoFactorCodeBlur={props.onTwoFactorCodeBlur}
        onTwoFactorCodeInputChange={props.onTwoFactorCodeInputChange}
        onTwoFactorPasswordBlur={props.onTwoFactorPasswordBlur}
        onTwoFactorPasswordInputChange={props.onTwoFactorPasswordInputChange}
        onUsernameBlur={props.onUsernameBlur}
        onUsernameInputChange={props.onUsernameInputChange}
        passwordSaving={props.passwordSaving}
        twoFactorCodeError={props.twoFactorCodeError}
        twoFactorCodeInput={props.twoFactorCodeInput}
        twoFactorEnabled={props.twoFactorEnabled}
        twoFactorLoading={props.twoFactorLoading}
        twoFactorPasswordError={props.twoFactorPasswordError}
        twoFactorPasswordInput={props.twoFactorPasswordInput}
        twoFactorPendingSetup={props.twoFactorPendingSetup}
        twoFactorSetupAccountName={props.twoFactorSetupAccountName}
        twoFactorSetupIssuer={props.twoFactorSetupIssuer}
        twoFactorSetupSecret={props.twoFactorSetupSecret}
        twoFactorSetupUri={props.twoFactorSetupUri}
        usernameError={props.usernameError}
        usernameInput={props.usernameInput}
        usernameSaving={props.usernameSaving}
      />
    </div>
  );
}

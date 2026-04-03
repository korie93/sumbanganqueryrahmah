import { MyAccountSecurityCard } from "@/pages/settings/MyAccountSecurityCard";

export interface AccountSecuritySectionProps {
  confirmPasswordInput: string;
  currentPasswordInput: string;
  currentUserRole: string;
  newPasswordInput: string;
  onDisableTwoFactor: () => void;
  onEnableTwoFactor: () => void;
  onChangePassword: () => void;
  onChangeUsername: () => void;
  onConfirmPasswordInputChange: (value: string) => void;
  onCurrentPasswordInputChange: (value: string) => void;
  onNewPasswordInputChange: (value: string) => void;
  onStartTwoFactorSetup: () => void;
  onTwoFactorCodeInputChange: (value: string) => void;
  onTwoFactorPasswordInputChange: (value: string) => void;
  onUsernameInputChange: (value: string) => void;
  passwordSaving: boolean;
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
}

export function AccountSecuritySection(props: AccountSecuritySectionProps) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <MyAccountSecurityCard
        confirmPasswordInput={props.confirmPasswordInput}
        currentPasswordInput={props.currentPasswordInput}
        currentUserRole={props.currentUserRole}
        newPasswordInput={props.newPasswordInput}
        onDisableTwoFactor={props.onDisableTwoFactor}
        onEnableTwoFactor={props.onEnableTwoFactor}
        onChangePassword={props.onChangePassword}
        onChangeUsername={props.onChangeUsername}
        onConfirmPasswordInputChange={props.onConfirmPasswordInputChange}
        onCurrentPasswordInputChange={props.onCurrentPasswordInputChange}
        onNewPasswordInputChange={props.onNewPasswordInputChange}
        onStartTwoFactorSetup={props.onStartTwoFactorSetup}
        onTwoFactorCodeInputChange={props.onTwoFactorCodeInputChange}
        onTwoFactorPasswordInputChange={props.onTwoFactorPasswordInputChange}
        onUsernameInputChange={props.onUsernameInputChange}
        passwordSaving={props.passwordSaving}
        twoFactorCodeInput={props.twoFactorCodeInput}
        twoFactorEnabled={props.twoFactorEnabled}
        twoFactorLoading={props.twoFactorLoading}
        twoFactorPasswordInput={props.twoFactorPasswordInput}
        twoFactorPendingSetup={props.twoFactorPendingSetup}
        twoFactorSetupAccountName={props.twoFactorSetupAccountName}
        twoFactorSetupIssuer={props.twoFactorSetupIssuer}
        twoFactorSetupSecret={props.twoFactorSetupSecret}
        twoFactorSetupUri={props.twoFactorSetupUri}
        usernameInput={props.usernameInput}
        usernameSaving={props.usernameSaving}
      />
    </div>
  );
}

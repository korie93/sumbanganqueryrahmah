import type { AccountSecuritySectionProps } from "@/pages/settings/AccountSecuritySection";
import type { ManagedSecretDialogProps } from "@/pages/settings/ManagedSecretDialog";
import type { ManagedUserDialogProps } from "@/pages/settings/ManagedUserDialog";
import type { ManagedUser } from "@/pages/settings/types";

type SecurityViewModelArgs = {
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
};

type ManagedDialogViewModelArgs = {
  confirmCriticalOpen: boolean;
  managedDialogOpen: boolean;
  managedEmailInput: string;
  managedFullNameInput: string;
  managedIsBanned: boolean;
  managedRoleInput: "admin" | "user";
  managedSaving: boolean;
  managedSelectedUser: ManagedUser | null;
  managedStatusInput: "pending_activation" | "active" | "suspended" | "disabled";
  managedUsernameInput: string;
  onCloseManagedDialog: () => void;
  onConfirmCriticalOpenChange: (open: boolean) => void;
  onConfirmManagedSave: () => void;
  onManagedDialogOpenChange: (open: boolean) => void;
  onManagedEmailInputChange: (value: string) => void;
  onManagedFullNameInputChange: (value: string) => void;
  onManagedIsBannedChange: (value: boolean) => void;
  onManagedRoleInputChange: (value: "admin" | "user") => void;
  onManagedStatusInputChange: (
    value: "pending_activation" | "active" | "suspended" | "disabled",
  ) => void;
  onManagedUsernameInputChange: (value: string) => void;
  onSaveCriticalSettings: () => Promise<void>;
  saving: boolean;
};

export function buildSettingsSecurityViewModel(
  args: SecurityViewModelArgs,
): AccountSecuritySectionProps {
  return {
    confirmPasswordInput: args.confirmPasswordInput,
    currentPasswordInput: args.currentPasswordInput,
    currentUserRole: args.currentUserRole,
    newPasswordInput: args.newPasswordInput,
    onDisableTwoFactor: args.onDisableTwoFactor,
    onEnableTwoFactor: args.onEnableTwoFactor,
    onChangePassword: args.onChangePassword,
    onChangeUsername: args.onChangeUsername,
    onConfirmPasswordInputChange: args.onConfirmPasswordInputChange,
    onCurrentPasswordInputChange: args.onCurrentPasswordInputChange,
    onNewPasswordInputChange: args.onNewPasswordInputChange,
    onStartTwoFactorSetup: args.onStartTwoFactorSetup,
    onTwoFactorCodeInputChange: args.onTwoFactorCodeInputChange,
    onTwoFactorPasswordInputChange: args.onTwoFactorPasswordInputChange,
    onUsernameInputChange: args.onUsernameInputChange,
    passwordSaving: args.passwordSaving,
    twoFactorCodeInput: args.twoFactorCodeInput,
    twoFactorEnabled: args.twoFactorEnabled,
    twoFactorLoading: args.twoFactorLoading,
    twoFactorPasswordInput: args.twoFactorPasswordInput,
    twoFactorPendingSetup: args.twoFactorPendingSetup,
    twoFactorSetupAccountName: args.twoFactorSetupAccountName,
    twoFactorSetupIssuer: args.twoFactorSetupIssuer,
    twoFactorSetupSecret: args.twoFactorSetupSecret,
    twoFactorSetupUri: args.twoFactorSetupUri,
    usernameInput: args.usernameInput,
    usernameSaving: args.usernameSaving,
  };
}

export function buildManagedDialogViewModel(
  args: ManagedDialogViewModelArgs,
): ManagedUserDialogProps {
  return {
    confirmCriticalOpen: args.confirmCriticalOpen,
    managedDialogOpen: args.managedDialogOpen,
    managedEmailInput: args.managedEmailInput,
    managedFullNameInput: args.managedFullNameInput,
    managedIsBanned: args.managedIsBanned,
    managedRoleInput: args.managedRoleInput,
    managedSaving: args.managedSaving,
    managedSelectedUser: args.managedSelectedUser,
    managedStatusInput: args.managedStatusInput,
    managedUsernameInput: args.managedUsernameInput,
    onCloseManagedDialog: args.onCloseManagedDialog,
    onConfirmCriticalOpenChange: args.onConfirmCriticalOpenChange,
    onConfirmManagedSave: args.onConfirmManagedSave,
    onManagedDialogOpenChange: args.onManagedDialogOpenChange,
    onManagedEmailInputChange: args.onManagedEmailInputChange,
    onManagedFullNameInputChange: args.onManagedFullNameInputChange,
    onManagedIsBannedChange: args.onManagedIsBannedChange,
    onManagedRoleInputChange: args.onManagedRoleInputChange,
    onManagedStatusInputChange: args.onManagedStatusInputChange,
    onManagedUsernameInputChange: args.onManagedUsernameInputChange,
    onSaveCriticalSettings: args.onSaveCriticalSettings,
    saving: args.saving,
  };
}

export function buildManagedSecretDialogViewModel(args: {
  description: string;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: string;
  value?: string;
}): ManagedSecretDialogProps {
  return {
    description: args.description,
    onOpenChange: args.onOpenChange,
    open: args.open,
    title: args.title,
    value: args.value,
  };
}

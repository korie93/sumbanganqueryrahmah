import type { AccountSecuritySectionProps } from "@/pages/settings/AccountSecuritySection";
import type { ManagedSecretDialogProps } from "@/pages/settings/ManagedSecretDialog";
import type { ManagedUserDialogProps } from "@/pages/settings/ManagedUserDialog";
import type { ManagedUser } from "@/pages/settings/types";
import type { ManageableUserRole } from "@shared/user-roles";

type SecurityViewModelArgs = {
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
};

type ManagedDialogViewModelArgs = {
  confirmCriticalOpen: boolean;
  managedDialogOpen: boolean;
  managedEmailInput: string;
  managedFullNameInput: string;
  managedIsBanned: boolean;
  managedRoleInput: ManageableUserRole;
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
  onManagedRoleInputChange: (value: ManageableUserRole) => void;
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
    confirmPasswordError: args.confirmPasswordError,
    currentPasswordInput: args.currentPasswordInput,
    currentPasswordError: args.currentPasswordError,
    currentUserRole: args.currentUserRole,
    newPasswordInput: args.newPasswordInput,
    newPasswordError: args.newPasswordError,
    onDisableTwoFactor: args.onDisableTwoFactor,
    onEnableTwoFactor: args.onEnableTwoFactor,
    onChangePassword: args.onChangePassword,
    onChangeUsername: args.onChangeUsername,
    onConfirmPasswordBlur: args.onConfirmPasswordBlur,
    onConfirmPasswordInputChange: args.onConfirmPasswordInputChange,
    onCurrentPasswordBlur: args.onCurrentPasswordBlur,
    onCurrentPasswordInputChange: args.onCurrentPasswordInputChange,
    onNewPasswordBlur: args.onNewPasswordBlur,
    onNewPasswordInputChange: args.onNewPasswordInputChange,
    onStartTwoFactorSetup: args.onStartTwoFactorSetup,
    onTwoFactorCodeBlur: args.onTwoFactorCodeBlur,
    onTwoFactorCodeInputChange: args.onTwoFactorCodeInputChange,
    onTwoFactorPasswordBlur: args.onTwoFactorPasswordBlur,
    onTwoFactorPasswordInputChange: args.onTwoFactorPasswordInputChange,
    onUsernameBlur: args.onUsernameBlur,
    onUsernameInputChange: args.onUsernameInputChange,
    passwordSaving: args.passwordSaving,
    twoFactorCodeError: args.twoFactorCodeError,
    twoFactorCodeInput: args.twoFactorCodeInput,
    twoFactorEnabled: args.twoFactorEnabled,
    twoFactorLoading: args.twoFactorLoading,
    twoFactorPasswordError: args.twoFactorPasswordError,
    twoFactorPasswordInput: args.twoFactorPasswordInput,
    twoFactorPendingSetup: args.twoFactorPendingSetup,
    twoFactorSetupAccountName: args.twoFactorSetupAccountName,
    twoFactorSetupIssuer: args.twoFactorSetupIssuer,
    twoFactorSetupSecret: args.twoFactorSetupSecret,
    twoFactorSetupUri: args.twoFactorSetupUri,
    usernameError: args.usernameError,
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

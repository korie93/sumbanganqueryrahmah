import type { AccountSecuritySectionProps } from "@/pages/settings/AccountSecuritySection";
import type { ManagedSecretDialogProps } from "@/pages/settings/ManagedSecretDialog";
import type { ManagedUserDialogProps } from "@/pages/settings/ManagedUserDialog";
import type { ManagedUser } from "@/pages/settings/types";
import type { DevMailOutboxPaginationState, DevMailOutboxQueryState } from "@/pages/settings/useSettingsDevMailOutbox";
import type {
  ManagedUsersPaginationState,
  ManagedUsersQueryState,
  PendingResetRequestsPaginationState,
  PendingResetRequestsQueryState,
} from "@/pages/settings/useSettingsManagedUserData";

type SecurityViewModelArgs = {
  clearingDevMailOutbox: boolean;
  confirmPasswordInput: string;
  createEmailInput: string;
  createFullNameInput: string;
  createRoleInput: "admin" | "user";
  createUsernameInput: string;
  creatingManagedUser: boolean;
  currentPasswordInput: string;
  currentUserRole: string;
  deletingDevMailOutboxId: string | null;
  deletingManagedUserId: string | null;
  devMailOutboxEnabled: boolean;
  devMailOutboxEntries: AccountSecuritySectionProps["devMailOutboxEntries"];
  devMailOutboxLoading: boolean;
  devMailOutboxPagination: DevMailOutboxPaginationState;
  devMailOutboxQuery: DevMailOutboxQueryState;
  isSuperuser: boolean;
  managedUsers: ManagedUser[];
  managedUsersLoading: boolean;
  managedUsersPagination: ManagedUsersPaginationState;
  managedUsersQuery: ManagedUsersQueryState;
  newPasswordInput: string;
  onDisableTwoFactor: () => void;
  onEnableTwoFactor: () => void;
  onChangePassword: () => void;
  onChangeUsername: () => void;
  onClearDevMailOutbox: () => void;
  onConfirmPasswordInputChange: (value: string) => void;
  onCreateEmailInputChange: (value: string) => void;
  onCreateFullNameInputChange: (value: string) => void;
  onCreateManagedUser: () => void;
  onCreateRoleInputChange: (value: "admin" | "user") => void;
  onCreateUsernameInputChange: (value: string) => void;
  onCurrentPasswordInputChange: (value: string) => void;
  onDeleteDevMailOutboxEntry: (previewId: string) => void;
  onDeleteManagedUser: (user: ManagedUser) => void;
  onDevMailOutboxRefresh: () => void;
  onDevMailOutboxQueryChange: (query: Partial<DevMailOutboxQueryState>) => void;
  onEditManagedUser: (user: ManagedUser) => void;
  onManagedBanToggle: (user: ManagedUser) => void;
  onManagedResetPassword: (user: ManagedUser) => void;
  onManagedResendActivation: (user: ManagedUser) => void;
  onManagedUsersRefresh: () => void;
  onManagedUsersQueryChange: (query: Partial<ManagedUsersQueryState>) => void;
  onNewPasswordInputChange: (value: string) => void;
  onStartTwoFactorSetup: () => void;
  onTwoFactorCodeInputChange: (value: string) => void;
  onTwoFactorPasswordInputChange: (value: string) => void;
  onPendingResetRequestsRefresh: () => void;
  onPendingResetRequestsQueryChange: (query: Partial<PendingResetRequestsQueryState>) => void;
  onUsernameInputChange: (value: string) => void;
  passwordSaving: boolean;
  pendingResetRequests: AccountSecuritySectionProps["pendingResetRequests"];
  pendingResetRequestsLoading: boolean;
  pendingResetRequestsPagination: PendingResetRequestsPaginationState;
  pendingResetRequestsQuery: PendingResetRequestsQueryState;
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
    clearingDevMailOutbox: args.clearingDevMailOutbox,
    confirmPasswordInput: args.confirmPasswordInput,
    createEmailInput: args.createEmailInput,
    createFullNameInput: args.createFullNameInput,
    createRoleInput: args.createRoleInput,
    createUsernameInput: args.createUsernameInput,
    creatingManagedUser: args.creatingManagedUser,
    currentPasswordInput: args.currentPasswordInput,
    currentUserRole: args.currentUserRole,
    deletingDevMailOutboxId: args.deletingDevMailOutboxId,
    deletingManagedUserId: args.deletingManagedUserId,
    devMailOutboxEnabled: args.devMailOutboxEnabled,
    devMailOutboxEntries: args.devMailOutboxEntries,
    devMailOutboxLoading: args.devMailOutboxLoading,
    devMailOutboxPagination: args.devMailOutboxPagination,
    devMailOutboxQuery: args.devMailOutboxQuery,
    isSuperuser: args.isSuperuser,
    managedUsers: args.managedUsers,
    managedUsersLoading: args.managedUsersLoading,
    managedUsersPagination: args.managedUsersPagination,
    managedUsersQuery: args.managedUsersQuery,
    newPasswordInput: args.newPasswordInput,
    onDisableTwoFactor: args.onDisableTwoFactor,
    onEnableTwoFactor: args.onEnableTwoFactor,
    onChangePassword: args.onChangePassword,
    onChangeUsername: args.onChangeUsername,
    onClearDevMailOutbox: args.onClearDevMailOutbox,
    onConfirmPasswordInputChange: args.onConfirmPasswordInputChange,
    onCreateEmailInputChange: args.onCreateEmailInputChange,
    onCreateFullNameInputChange: args.onCreateFullNameInputChange,
    onCreateManagedUser: args.onCreateManagedUser,
    onCreateRoleInputChange: args.onCreateRoleInputChange,
    onCreateUsernameInputChange: args.onCreateUsernameInputChange,
    onCurrentPasswordInputChange: args.onCurrentPasswordInputChange,
    onDeleteDevMailOutboxEntry: args.onDeleteDevMailOutboxEntry,
    onDeleteManagedUser: args.onDeleteManagedUser,
    onDevMailOutboxRefresh: args.onDevMailOutboxRefresh,
    onDevMailOutboxQueryChange: args.onDevMailOutboxQueryChange,
    onEditManagedUser: args.onEditManagedUser,
    onManagedBanToggle: args.onManagedBanToggle,
    onManagedResetPassword: args.onManagedResetPassword,
    onManagedResendActivation: args.onManagedResendActivation,
    onManagedUsersRefresh: args.onManagedUsersRefresh,
    onManagedUsersQueryChange: args.onManagedUsersQueryChange,
    onNewPasswordInputChange: args.onNewPasswordInputChange,
    onStartTwoFactorSetup: args.onStartTwoFactorSetup,
    onTwoFactorCodeInputChange: args.onTwoFactorCodeInputChange,
    onTwoFactorPasswordInputChange: args.onTwoFactorPasswordInputChange,
    onPendingResetRequestsRefresh: args.onPendingResetRequestsRefresh,
    onPendingResetRequestsQueryChange: args.onPendingResetRequestsQueryChange,
    onUsernameInputChange: args.onUsernameInputChange,
    passwordSaving: args.passwordSaving,
    pendingResetRequests: args.pendingResetRequests,
    pendingResetRequestsLoading: args.pendingResetRequestsLoading,
    pendingResetRequestsPagination: args.pendingResetRequestsPagination,
    pendingResetRequestsQuery: args.pendingResetRequestsQuery,
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

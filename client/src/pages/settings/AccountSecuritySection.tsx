import { Suspense, lazy } from "react";
import { MyAccountSecurityCard } from "@/pages/settings/MyAccountSecurityCard";
import type {
  DevMailOutboxPreview,
  ManagedUser,
  PendingPasswordResetRequest,
} from "@/pages/settings/types";
import type { DevMailOutboxPaginationState, DevMailOutboxQueryState } from "@/pages/settings/useSettingsDevMailOutbox";
import type {
  ManagedUsersPaginationState,
  ManagedUsersQueryState,
  PendingResetRequestsPaginationState,
  PendingResetRequestsQueryState,
} from "@/pages/settings/useSettingsManagedUserData";

const UserAccountManagementSection = lazy(() =>
  import("@/pages/settings/UserAccountManagementSection").then((module) => ({
    default: module.UserAccountManagementSection,
  })),
);

export interface AccountSecuritySectionProps {
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
  devMailOutboxEntries: DevMailOutboxPreview[];
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
  pendingResetRequests: PendingPasswordResetRequest[];
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
  showAccountManagement?: boolean;
}

export function AccountSecuritySection(props: AccountSecuritySectionProps) {
  return (
    <div className="space-y-6">
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

      {props.showAccountManagement ? (
        <Suspense fallback={<div className="rounded-lg border border-border/60 bg-background/70 p-6 text-sm text-muted-foreground">Loading account management...</div>}>
          <UserAccountManagementSection
            clearingDevMailOutbox={props.clearingDevMailOutbox}
            createEmailInput={props.createEmailInput}
            createFullNameInput={props.createFullNameInput}
            createRoleInput={props.createRoleInput}
            createUsernameInput={props.createUsernameInput}
            creatingManagedUser={props.creatingManagedUser}
            deletingDevMailOutboxId={props.deletingDevMailOutboxId}
            deletingManagedUserId={props.deletingManagedUserId}
            devMailOutboxEnabled={props.devMailOutboxEnabled}
            devMailOutboxEntries={props.devMailOutboxEntries}
            devMailOutboxLoading={props.devMailOutboxLoading}
            devMailOutboxPagination={props.devMailOutboxPagination}
            devMailOutboxQuery={props.devMailOutboxQuery}
            isSuperuser={props.isSuperuser}
            managedUsers={props.managedUsers}
            managedUsersLoading={props.managedUsersLoading}
            managedUsersPagination={props.managedUsersPagination}
            managedUsersQuery={props.managedUsersQuery}
            onClearDevMailOutbox={props.onClearDevMailOutbox}
            onCreateEmailInputChange={props.onCreateEmailInputChange}
            onCreateFullNameInputChange={props.onCreateFullNameInputChange}
            onCreateManagedUser={props.onCreateManagedUser}
            onCreateRoleInputChange={props.onCreateRoleInputChange}
            onCreateUsernameInputChange={props.onCreateUsernameInputChange}
            onDeleteDevMailOutboxEntry={props.onDeleteDevMailOutboxEntry}
            onDeleteManagedUser={props.onDeleteManagedUser}
            onDevMailOutboxRefresh={props.onDevMailOutboxRefresh}
            onDevMailOutboxQueryChange={props.onDevMailOutboxQueryChange}
            onEditManagedUser={props.onEditManagedUser}
            onManagedBanToggle={props.onManagedBanToggle}
            onManagedResetPassword={props.onManagedResetPassword}
            onManagedResendActivation={props.onManagedResendActivation}
            onManagedUsersRefresh={props.onManagedUsersRefresh}
            onManagedUsersQueryChange={props.onManagedUsersQueryChange}
            onPendingResetRequestsRefresh={props.onPendingResetRequestsRefresh}
            onPendingResetRequestsQueryChange={props.onPendingResetRequestsQueryChange}
            pendingResetRequests={props.pendingResetRequests}
            pendingResetRequestsLoading={props.pendingResetRequestsLoading}
            pendingResetRequestsPagination={props.pendingResetRequestsPagination}
            pendingResetRequestsQuery={props.pendingResetRequestsQuery}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

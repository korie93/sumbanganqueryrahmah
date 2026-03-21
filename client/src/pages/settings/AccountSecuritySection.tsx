import { MyAccountSecurityCard } from "@/pages/settings/MyAccountSecurityCard";
import { UserAccountManagementSection } from "@/pages/settings/UserAccountManagementSection";
import type {
  DevMailOutboxPreview,
  ManagedUser,
  PendingPasswordResetRequest,
} from "@/pages/settings/types";
import type { DevMailOutboxPaginationState, DevMailOutboxQueryState } from "@/pages/settings/useSettingsDevMailOutbox";

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
  newPasswordInput: string;
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
  onNewPasswordInputChange: (value: string) => void;
  onPendingResetRequestsRefresh: () => void;
  onUsernameInputChange: (value: string) => void;
  passwordSaving: boolean;
  pendingResetRequests: PendingPasswordResetRequest[];
  pendingResetRequestsLoading: boolean;
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
        onChangePassword={props.onChangePassword}
        onChangeUsername={props.onChangeUsername}
        onConfirmPasswordInputChange={props.onConfirmPasswordInputChange}
        onCurrentPasswordInputChange={props.onCurrentPasswordInputChange}
        onNewPasswordInputChange={props.onNewPasswordInputChange}
        onUsernameInputChange={props.onUsernameInputChange}
        passwordSaving={props.passwordSaving}
        usernameInput={props.usernameInput}
        usernameSaving={props.usernameSaving}
      />

      {props.showAccountManagement ? (
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
          onPendingResetRequestsRefresh={props.onPendingResetRequestsRefresh}
          pendingResetRequests={props.pendingResetRequests}
          pendingResetRequestsLoading={props.pendingResetRequestsLoading}
        />
      ) : null}
    </div>
  );
}

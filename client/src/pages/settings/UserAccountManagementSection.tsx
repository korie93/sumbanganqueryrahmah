import { useMemo } from "react";
import { UserAccountManagementContent } from "@/pages/settings/account-management/UserAccountManagementContent";
import { UserAccountManagementHeader } from "@/pages/settings/account-management/UserAccountManagementHeader";
import { UserAccountManagementNav } from "@/pages/settings/account-management/UserAccountManagementNav";
import { UserAccountManagementOverview } from "@/pages/settings/account-management/UserAccountManagementOverview";
import type { UserAccountManagementSectionProps } from "@/pages/settings/account-management/user-account-management-shared";
import { buildManagedAccountAttentionSummary } from "@/pages/settings/account-management/managed-accounts-utils";
import { useUserAccountManagementSectionState } from "@/pages/settings/account-management/useUserAccountManagementSectionState";

export type { UserAccountManagementSectionProps } from "@/pages/settings/account-management/user-account-management-shared";

export function UserAccountManagementSection({
  clearingDevMailOutbox,
  createEmailInput,
  createFieldErrors,
  createFullNameInput,
  createRoleInput,
  createUsernameInput,
  createDashboardNicknameId,
  creatingManagedUser,
  deletingDevMailOutboxId,
  deletingManagedUserId,
  devMailOutboxEnabled,
  devMailOutboxEntries,
  devMailOutboxLoading,
  devMailOutboxPagination,
  devMailOutboxQuery,
  isSuperuser,
  managedUsers,
  managedUsersLoading,
  managedUsersPagination,
  managedUsersQuery,
  onClearDevMailOutbox,
  onCreateEmailInputChange,
  onCreateFieldBlur,
  onCreateFullNameInputChange,
  onCreateManagedUser,
  onCreateRoleInputChange,
  onCreateUsernameInputChange,
  onCreateDashboardNicknameIdChange,
  onDeleteDevMailOutboxEntry,
  onDeleteManagedUser,
  onDevMailOutboxRefresh,
  onDevMailOutboxQueryChange,
  onEditManagedUser,
  onManagedBanToggle,
  onManagedResetPassword,
  onManagedResendActivation,
  onManagedUsersRefresh,
  onManagedUsersQueryChange,
  onPendingResetRequestsRefresh,
  onPendingResetRequestsQueryChange,
  pendingResetRequests,
  pendingResetRequestsLoading,
  pendingResetRequestsPagination,
  pendingResetRequestsQuery,
}: UserAccountManagementSectionProps) {
  const sectionState = useUserAccountManagementSectionState();
  const attentionSummary = useMemo(
    () => buildManagedAccountAttentionSummary(managedUsers),
    [managedUsers],
  );

  if (!isSuperuser) {
    return null;
  }

  return (
    <section aria-label="Account management workspace" data-testid="account-management-workspace" className="min-w-0 space-y-4">
      <UserAccountManagementHeader
        onCreate={() => sectionState.onSelectTab("create-closed-account")}
      />
      <UserAccountManagementNav
        activeTab={sectionState.activeTab}
        pendingResetCount={pendingResetRequestsPagination.total}
        onSelect={sectionState.onSelectTab}
      />
        <UserAccountManagementOverview
          managedUserCount={managedUsersPagination.total}
          visibleAttentionCount={attentionSummary.totalAttentionCount}
          pendingResetCount={pendingResetRequestsPagination.total}
          loading={managedUsersLoading || pendingResetRequestsLoading}
        />
          <UserAccountManagementContent
            activeTab={sectionState.activeTab}
            clearingDevMailOutbox={clearingDevMailOutbox}
            createEmailInput={createEmailInput}
            createFieldErrors={createFieldErrors}
            createFullNameInput={createFullNameInput}
            createRoleInput={createRoleInput}
            createUsernameInput={createUsernameInput}
            {...(createDashboardNicknameId !== undefined ? { createDashboardNicknameId } : {})}
            creatingManagedUser={creatingManagedUser}
            deletingDevMailOutboxId={deletingDevMailOutboxId}
            deletingManagedUserId={deletingManagedUserId}
            devMailOutboxEnabled={devMailOutboxEnabled}
            devMailOutboxEntries={devMailOutboxEntries}
            devMailOutboxLoading={devMailOutboxLoading}
            devMailOutboxPagination={devMailOutboxPagination}
            devMailOutboxQuery={devMailOutboxQuery}
            isPending={sectionState.isPending}
            managedUsers={managedUsers}
            managedUsersLoading={managedUsersLoading}
            managedUsersPagination={managedUsersPagination}
            managedUsersQuery={managedUsersQuery}
            onClearDevMailOutbox={onClearDevMailOutbox}
            onCreateEmailInputChange={onCreateEmailInputChange}
            onCreateFieldBlur={onCreateFieldBlur}
            onCreateFullNameInputChange={onCreateFullNameInputChange}
            onCreateManagedUser={onCreateManagedUser}
            onCreateRoleInputChange={onCreateRoleInputChange}
            onCreateUsernameInputChange={onCreateUsernameInputChange}
            {...(onCreateDashboardNicknameIdChange ? { onCreateDashboardNicknameIdChange } : {})}
            onDeleteDevMailOutboxEntry={onDeleteDevMailOutboxEntry}
            onDeleteManagedUser={onDeleteManagedUser}
            onDevMailOutboxQueryChange={onDevMailOutboxQueryChange}
            onDevMailOutboxRefresh={onDevMailOutboxRefresh}
            onEditManagedUser={onEditManagedUser}
            onManagedBanToggle={onManagedBanToggle}
            onManagedResetPassword={onManagedResetPassword}
            onManagedResendActivation={onManagedResendActivation}
            onManagedUsersQueryChange={onManagedUsersQueryChange}
            onManagedUsersRefresh={onManagedUsersRefresh}
            onPendingResetRequestsQueryChange={onPendingResetRequestsQueryChange}
            onPendingResetRequestsRefresh={onPendingResetRequestsRefresh}
            pendingResetRequests={pendingResetRequests}
            pendingResetRequestsLoading={pendingResetRequestsLoading}
            pendingResetRequestsPagination={pendingResetRequestsPagination}
            pendingResetRequestsQuery={pendingResetRequestsQuery}
          />
    </section>
  );
}

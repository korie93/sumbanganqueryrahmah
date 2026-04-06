import { Card, CardContent } from "@/components/ui/card";
import { useIsMobile } from "@/hooks/use-mobile";
import { UserAccountManagementContent } from "@/pages/settings/account-management/UserAccountManagementContent";
import { UserAccountManagementHeader } from "@/pages/settings/account-management/UserAccountManagementHeader";
import { UserAccountManagementNav } from "@/pages/settings/account-management/UserAccountManagementNav";
import type { UserAccountManagementSectionProps } from "@/pages/settings/account-management/user-account-management-shared";
import { useUserAccountManagementSectionState } from "@/pages/settings/account-management/useUserAccountManagementSectionState";

export type { UserAccountManagementSectionProps } from "@/pages/settings/account-management/user-account-management-shared";

export function UserAccountManagementSection({
  clearingDevMailOutbox,
  createEmailInput,
  createFullNameInput,
  createRoleInput,
  createUsernameInput,
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
  onCreateFullNameInputChange,
  onCreateManagedUser,
  onCreateRoleInputChange,
  onCreateUsernameInputChange,
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
  const isMobile = useIsMobile();
  const sectionState = useUserAccountManagementSectionState();

  if (!isSuperuser) {
    return null;
  }

  return (
    <Card className="border-border/60 bg-background/70">
      <UserAccountManagementHeader
        isMobile={isMobile}
        managedUserCount={managedUsersPagination.total}
        outboxCount={devMailOutboxPagination.total}
        pendingResetCount={pendingResetRequestsPagination.total}
      />
      <CardContent className={isMobile ? "pt-0" : undefined}>
        <div className="relative flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-4">
          <UserAccountManagementNav
            activeTab={sectionState.activeTab}
            collapsed={sectionState.navCollapsed}
            managedUserCount={managedUsersPagination.total}
            mobileOpen={sectionState.mobileNavOpen}
            outboxCount={devMailOutboxPagination.total}
            onCollapsedChange={sectionState.setNavCollapsed}
            onMobileOpenChange={sectionState.setMobileNavOpen}
            pendingResetCount={pendingResetRequestsPagination.total}
            onSelect={sectionState.onSelectTab}
          />

          <UserAccountManagementContent
            activeTab={sectionState.activeTab}
            clearingDevMailOutbox={clearingDevMailOutbox}
            createEmailInput={createEmailInput}
            createFullNameInput={createFullNameInput}
            createRoleInput={createRoleInput}
            createUsernameInput={createUsernameInput}
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
            onCreateFullNameInputChange={onCreateFullNameInputChange}
            onCreateManagedUser={onCreateManagedUser}
            onCreateRoleInputChange={onCreateRoleInputChange}
            onCreateUsernameInputChange={onCreateUsernameInputChange}
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
        </div>
      </CardContent>
    </Card>
  );
}

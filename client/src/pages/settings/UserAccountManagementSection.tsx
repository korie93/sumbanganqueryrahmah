import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useIsMobile } from "@/hooks/use-mobile";
import { UserAccountManagementContent } from "@/pages/settings/account-management/UserAccountManagementContent";
import { UserAccountManagementHeader } from "@/pages/settings/account-management/UserAccountManagementHeader";
import { UserAccountManagementNav } from "@/pages/settings/account-management/UserAccountManagementNav";
import { UserAccountManagementOverview } from "@/pages/settings/account-management/UserAccountManagementOverview";
import type { UserAccountManagementSectionProps } from "@/pages/settings/account-management/user-account-management-shared";
import {
  buildAccountActionQueue,
  buildAccountHealthMetrics,
} from "@/pages/settings/account-management/user-account-management-utils";
import { useUserAccountManagementSectionState } from "@/pages/settings/account-management/useUserAccountManagementSectionState";

export type { UserAccountManagementSectionProps } from "@/pages/settings/account-management/user-account-management-shared";

export function UserAccountManagementSection({
  clearingDevMailOutbox,
  createEmailInput,
  createFieldErrors,
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
  onCreateFieldBlur,
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
  const overviewInput = useMemo(
    () => ({
      managedUserTotal: managedUsersPagination.total,
      managedUsers,
      outboxTotal: devMailOutboxPagination.total,
      pendingResetTotal: pendingResetRequestsPagination.total,
    }),
    [
      devMailOutboxPagination.total,
      managedUsers,
      managedUsersPagination.total,
      pendingResetRequestsPagination.total,
    ],
  );
  const accountHealthMetrics = useMemo(
    () => buildAccountHealthMetrics(overviewInput),
    [overviewInput],
  );
  const accountActionQueue = useMemo(
    () => buildAccountActionQueue(overviewInput),
    [overviewInput],
  );

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
      <CardContent className={isMobile ? "pt-0" : ""}>
        <UserAccountManagementOverview
          actions={accountActionQueue}
          activeTab={sectionState.activeTab}
          metrics={accountHealthMetrics}
          onActionSelect={(action) => sectionState.onSelectTab(action.targetTab)}
        />
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
            createFieldErrors={createFieldErrors}
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
            onCreateFieldBlur={onCreateFieldBlur}
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

import { useMemo, useState } from "react";
import { RefreshCw, UserCog } from "lucide-react";
import { AppPaginationBar } from "@/components/data/AppPaginationBar";
import { SideTabDataPanel } from "@/components/layout/SideTabDataPanel";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { ManagedAccountActionDialogs } from "@/pages/settings/account-management/ManagedAccountActionDialogs";
import { ManagedAccountDetailSheet } from "@/pages/settings/account-management/ManagedAccountDetailSheet";
import { ManagedAccountsAttentionSummary } from "@/pages/settings/account-management/ManagedAccountsAttentionSummary";
import { DeleteManagedAccountDialog } from "@/pages/settings/account-management/DeleteManagedAccountDialog";
import { ManagedAccountsDesktopTable } from "@/pages/settings/account-management/ManagedAccountsDesktopTable";
import { ManagedAccountsFiltersPanel } from "@/pages/settings/account-management/ManagedAccountsFiltersPanel";
import { ManagedAccountsMobileList } from "@/pages/settings/account-management/ManagedAccountsMobileList";
import type { ManagedAccountsSectionProps } from "@/pages/settings/account-management/managed-accounts-shared";
import { buildManagedAccountAttentionSummary } from "@/pages/settings/account-management/managed-accounts-utils";
import { ACCOUNT_MANAGEMENT_FILTER_RESET_PAGE } from "@/pages/settings/account-management/utils";
import { useManagedAccountsFilterState } from "@/pages/settings/account-management/useManagedAccountsFilterState";
import type { ManagedUser } from "@/pages/settings/types";

export function ManagedAccountsSection({
  deletingManagedUserId,
  loading,
  managedUsers,
  pagination,
  query,
  onBanToggle,
  onDeleteUser,
  onEditUser,
  onQueryChange,
  onRefresh,
  onResetPassword,
  onResendActivation,
}: ManagedAccountsSectionProps) {
  const isMobile = useIsMobile();
  const [detailUser, setDetailUser] = useState<ManagedUser | null>(null);
  const filterState = useManagedAccountsFilterState({
    loading,
    onQueryChange,
    query,
    total: pagination.total,
  });
  const attentionSummary = useMemo(
    () => buildManagedAccountAttentionSummary(managedUsers),
    [managedUsers],
  );

  return (
    <>
      <SideTabDataPanel
        title="Managed Account"
        description="Search and manage closed accounts without crowding the rest of the Security page."
        icon={UserCog}
        actions={
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
        filters={
          <ManagedAccountsFiltersPanel
            activeFilters={filterState.activeFilters}
            hasActiveFilters={filterState.hasActiveFilters}
            roleFilter={filterState.roleFilter}
            searchQuery={filterState.searchQuery}
            statusFilter={filterState.statusFilter}
            onClearAll={filterState.clearAllFilters}
            onRoleChange={filterState.onRoleChange}
            onSearchQueryChange={filterState.onSearchQueryChange}
            onStatusChange={filterState.onStatusChange}
          />
        }
        summary={
          <ManagedAccountsAttentionSummary
            activeStatus={filterState.statusFilter}
            loading={loading}
            summary={attentionSummary}
            totalUsers={pagination.total}
            onStatusChange={filterState.onStatusChange}
          />
        }
        pagination={
          <AppPaginationBar
            disabled={loading}
            loading={loading}
            page={pagination.page}
            totalPages={pagination.totalPages}
            pageSize={pagination.pageSize}
            totalItems={pagination.total}
            itemLabel="users"
            onPageChange={(page) => {
              onQueryChange({ page });
            }}
            onPageSizeChange={(pageSize) => {
              onQueryChange({
                page: ACCOUNT_MANAGEMENT_FILTER_RESET_PAGE,
                pageSize,
              });
            }}
          />
        }
      >
        {isMobile ? (
          <ManagedAccountsMobileList
            deletingManagedUserId={deletingManagedUserId}
            emptyMessage={filterState.emptyMessage}
            loading={loading}
            managedUsers={managedUsers}
            onBanToggle={filterState.openBanToggleDialog}
            onEditUser={onEditUser}
            onRequestDelete={filterState.openDeleteDialog}
            onResetPassword={filterState.openResetPasswordDialog}
            onResendActivation={onResendActivation}
            onViewDetails={setDetailUser}
          />
        ) : (
          <ManagedAccountsDesktopTable
            deletingManagedUserId={deletingManagedUserId}
            emptyMessage={filterState.emptyMessage}
            loading={loading}
            managedUsers={managedUsers}
            onBanToggle={filterState.openBanToggleDialog}
            onEditUser={onEditUser}
            onRequestDelete={filterState.openDeleteDialog}
            onResetPassword={filterState.openResetPasswordDialog}
            onResendActivation={onResendActivation}
            onViewDetails={setDetailUser}
          />
        )}
      </SideTabDataPanel>

      <ManagedAccountDetailSheet
        deletingManagedUserId={deletingManagedUserId}
        user={detailUser}
        onBanToggle={filterState.openBanToggleDialog}
        onClose={() => setDetailUser(null)}
        onEditUser={onEditUser}
        onRequestDelete={filterState.openDeleteDialog}
        onResetPassword={filterState.openResetPasswordDialog}
        onResendActivation={onResendActivation}
      />

      <ManagedAccountActionDialogs
        banToggleUser={filterState.userToBanToggle}
        resetPasswordUser={filterState.userToResetPassword}
        onCloseBanToggle={filterState.closeBanToggleDialog}
        onCloseResetPassword={filterState.closeResetPasswordDialog}
        onConfirmBanToggle={onBanToggle}
        onConfirmResetPassword={onResetPassword}
      />

      <DeleteManagedAccountDialog
        deletingManagedUserId={deletingManagedUserId}
        user={filterState.userToDelete}
        onClose={filterState.closeDeleteDialog}
        onDeleteUser={onDeleteUser}
      />
    </>
  );
}

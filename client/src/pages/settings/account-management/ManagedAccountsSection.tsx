import { RefreshCw, UserCog, Users } from "lucide-react";
import { AppPaginationBar } from "@/components/data/AppPaginationBar";
import { SideTabDataPanel } from "@/components/layout/SideTabDataPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { ManagedAccountActionDialogs } from "@/pages/settings/account-management/ManagedAccountActionDialogs";
import { DeleteManagedAccountDialog } from "@/pages/settings/account-management/DeleteManagedAccountDialog";
import { ManagedAccountsDesktopTable } from "@/pages/settings/account-management/ManagedAccountsDesktopTable";
import { ManagedAccountsFiltersPanel } from "@/pages/settings/account-management/ManagedAccountsFiltersPanel";
import { ManagedAccountsMobileList } from "@/pages/settings/account-management/ManagedAccountsMobileList";
import type { ManagedAccountsSectionProps } from "@/pages/settings/account-management/managed-accounts-shared";
import { ACCOUNT_MANAGEMENT_FILTER_RESET_PAGE } from "@/pages/settings/account-management/utils";
import { useManagedAccountsFilterState } from "@/pages/settings/account-management/useManagedAccountsFilterState";

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
  const filterState = useManagedAccountsFilterState({
    loading,
    onQueryChange,
    query,
    total: pagination.total,
  });

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
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-sm">
            <div className="flex items-center gap-2 font-medium">
              <Users className="h-4 w-4 text-muted-foreground" />
              Total users: {pagination.total}
            </div>
            <Badge variant="secondary">Current page {managedUsers.length}</Badge>
          </div>
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
          />
        )}
      </SideTabDataPanel>

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

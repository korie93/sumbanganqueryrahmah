import { useMemo, useState } from "react";
import { AppPaginationBar } from "@/components/data/AppPaginationBar";
import { useIsMobile } from "@/hooks/use-mobile";
import { ManagedAccountActionDialogs } from "@/pages/settings/account-management/ManagedAccountActionDialogs";
import { ManagedAccountDetailSheet } from "@/pages/settings/account-management/ManagedAccountDetailSheet";
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
      <section aria-label="Managed accounts" data-testid="managed-accounts-workspace" className="min-w-0 space-y-4">
          <ManagedAccountsFiltersPanel
            activeFilters={filterState.activeFilters}
            attentionSummary={attentionSummary}
            hasActiveFilters={filterState.hasActiveFilters}
            loading={loading}
            roleFilter={filterState.roleFilter}
            searchQuery={filterState.searchQuery}
            statusFilter={filterState.statusFilter}
            onClearAll={filterState.clearAllFilters}
            onRefresh={onRefresh}
            onRoleChange={filterState.onRoleChange}
            onSearchQueryChange={filterState.onSearchQueryChange}
            onStatusChange={filterState.onStatusChange}
          />
        <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
        {isMobile ? (
          <ManagedAccountsMobileList
            deletingManagedUserId={deletingManagedUserId}
            emptyState={filterState.emptyState}
            loading={loading}
            managedUsers={managedUsers}
            onClearFilters={
              filterState.hasActiveFilters ? filterState.clearAllFilters : undefined
            }
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
            emptyState={filterState.emptyState}
            loading={loading}
            managedUsers={managedUsers}
            onClearFilters={
              filterState.hasActiveFilters ? filterState.clearAllFilters : undefined
            }
            onBanToggle={filterState.openBanToggleDialog}
            onEditUser={onEditUser}
            onRequestDelete={filterState.openDeleteDialog}
            onResetPassword={filterState.openResetPasswordDialog}
            onResendActivation={onResendActivation}
            onViewDetails={setDetailUser}
          />
        )}
          <div className="border-t border-border/70 pr-16 [&>div]:rounded-none [&>div]:border-0 [&>div]:bg-transparent" data-floating-ai-avoid="true">
            <AppPaginationBar
              disabled={loading}
              loading={loading}
              page={pagination.page}
              totalPages={pagination.totalPages}
              pageSize={pagination.pageSize}
              totalItems={pagination.total}
              itemLabel="accounts"
              onPageChange={(page) => onQueryChange({ page })}
              onPageSizeChange={(pageSize) => onQueryChange({ page: ACCOUNT_MANAGEMENT_FILTER_RESET_PAGE, pageSize })}
            />
          </div>
        </div>
      </section>

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

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ManagedAccountsEmptyState } from "@/pages/settings/account-management/ManagedAccountsEmptyState";
import { ManagedAccountRow } from "@/pages/settings/account-management/ManagedAccountRow";
import type { ManagedAccountsEmptyStateContent } from "@/pages/settings/account-management/managed-accounts-shared";
import type { ManagedUser } from "@/pages/settings/types";

type ManagedAccountsDesktopTableProps = {
  deletingManagedUserId: string | null;
  emptyState: ManagedAccountsEmptyStateContent;
  loading: boolean;
  managedUsers: ManagedUser[];
  onBanToggle: (user: ManagedUser) => void;
  onEditUser: (user: ManagedUser) => void;
  onRequestDelete: (user: ManagedUser) => void;
  onResetPassword: (user: ManagedUser) => void;
  onResendActivation: (user: ManagedUser) => void;
  onViewDetails: (user: ManagedUser) => void;
  onClearFilters?: (() => void) | undefined;
};

export function ManagedAccountsDesktopTable({
  deletingManagedUserId,
  emptyState,
  loading,
  managedUsers,
  onBanToggle,
  onEditUser,
  onRequestDelete,
  onResetPassword,
  onResendActivation,
  onViewDetails,
  onClearFilters,
}: ManagedAccountsDesktopTableProps) {
  return (
    <Table className="min-w-[980px] text-sm">
      <TableHeader>
        <TableRow>
          <TableHead>User</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Last Login</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading || managedUsers.length === 0 ? (
          <TableRow>
            <TableCell colSpan={5} className="p-0">
              <ManagedAccountsEmptyState
                state={emptyState}
                onClearFilters={onClearFilters}
              />
            </TableCell>
          </TableRow>
        ) : (
          managedUsers.map((user) => (
            <ManagedAccountRow
              key={user.id}
              deletingManagedUserId={deletingManagedUserId}
              onBanToggle={onBanToggle}
              onDelete={onRequestDelete}
              onEdit={onEditUser}
              onResetPassword={onResetPassword}
              onResendActivation={onResendActivation}
              onViewDetails={onViewDetails}
              user={user}
            />
          ))
        )}
      </TableBody>
    </Table>
  );
}

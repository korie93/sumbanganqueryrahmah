import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ManagedAccountRow } from "@/pages/settings/account-management/ManagedAccountRow";
import type { ManagedUser } from "@/pages/settings/types";

type ManagedAccountsDesktopTableProps = {
  deletingManagedUserId: string | null;
  emptyMessage: string;
  loading: boolean;
  managedUsers: ManagedUser[];
  onBanToggle: (user: ManagedUser) => void;
  onEditUser: (user: ManagedUser) => void;
  onRequestDelete: (user: ManagedUser) => void;
  onResetPassword: (user: ManagedUser) => void;
  onResendActivation: (user: ManagedUser) => void;
};

export function ManagedAccountsDesktopTable({
  deletingManagedUserId,
  emptyMessage,
  loading,
  managedUsers,
  onBanToggle,
  onEditUser,
  onRequestDelete,
  onResetPassword,
  onResendActivation,
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
            <TableCell colSpan={5} className="text-center text-muted-foreground">
              {emptyMessage}
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
              user={user}
            />
          ))
        )}
      </TableBody>
    </Table>
  );
}

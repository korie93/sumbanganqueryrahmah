import { useDeferredValue, useMemo, useState } from "react";
import { RefreshCw, Search, UserCog, Users } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AppPaginationBar } from "@/components/data/AppPaginationBar";
import { SideTabDataPanel } from "@/components/layout/SideTabDataPanel";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePaginatedItems } from "@/hooks/usePaginatedItems";
import { ManagedAccountRow } from "@/pages/settings/account-management/ManagedAccountRow";
import { normalizeSearchValue } from "@/pages/settings/account-management/utils";
import type { ManagedUser } from "@/pages/settings/types";

interface ManagedAccountsSectionProps {
  deletingManagedUserId: string | null;
  loading: boolean;
  managedUsers: ManagedUser[];
  onBanToggle: (user: ManagedUser) => void;
  onDeleteUser: (user: ManagedUser) => void;
  onEditUser: (user: ManagedUser) => void;
  onRefresh: () => void;
  onResetPassword: (user: ManagedUser) => void;
  onResendActivation: (user: ManagedUser) => void;
}

export function ManagedAccountsSection({
  deletingManagedUserId,
  loading,
  managedUsers,
  onBanToggle,
  onDeleteUser,
  onEditUser,
  onRefresh,
  onResetPassword,
  onResendActivation,
}: ManagedAccountsSectionProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "user">("all");
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "pending_activation" | "suspended" | "disabled" | "banned"
  >("all");
  const [userToDelete, setUserToDelete] = useState<ManagedUser | null>(null);
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const filteredUsers = useMemo(() => {
    const normalizedSearch = normalizeSearchValue(deferredSearchQuery);
    return managedUsers.filter((user) => {
      const combinedText = [
        user.username,
        user.fullName || "",
        user.email || "",
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch = !normalizedSearch || combinedText.includes(normalizedSearch);
      const matchesRole = roleFilter === "all" || user.role === roleFilter;
      const effectiveStatus = user.isBanned ? "banned" : user.status;
      const matchesStatus = statusFilter === "all" || effectiveStatus === statusFilter;
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [deferredSearchQuery, managedUsers, roleFilter, statusFilter]);

  const emptyMessage = loading
    ? "Loading users..."
    : managedUsers.length === 0
      ? "No managed accounts found."
      : "No managed accounts match the current filters.";
  const pagination = usePaginatedItems(filteredUsers, {
    resetKey: `${deferredSearchQuery}::${roleFilter}::${statusFilter}`,
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
          <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_180px_180px]">
            <div className="space-y-2">
              <p className="text-sm font-medium">Search by user name</p>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search username, full name, or email"
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Role</p>
              <select
                value={roleFilter}
                onChange={(event) =>
                  setRoleFilter(event.target.value === "admin" || event.target.value === "user"
                    ? event.target.value
                    : "all")
                }
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="all">All roles</option>
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Status</p>
              <select
                value={statusFilter}
                onChange={(event) =>
                  setStatusFilter(
                    event.target.value === "active"
                    || event.target.value === "pending_activation"
                    || event.target.value === "suspended"
                    || event.target.value === "disabled"
                    || event.target.value === "banned"
                      ? event.target.value
                      : "all",
                  )
                }
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="all">All statuses</option>
                <option value="active">active</option>
                <option value="pending_activation">pending_activation</option>
                <option value="suspended">suspended</option>
                <option value="disabled">disabled</option>
                <option value="banned">banned</option>
              </select>
            </div>
          </div>
        }
        summary={
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-sm">
            <div className="flex items-center gap-2 font-medium">
              <Users className="h-4 w-4 text-muted-foreground" />
              Total users: {managedUsers.length}
            </div>
            <Badge variant="secondary">Filtered {filteredUsers.length}</Badge>
          </div>
        }
        pagination={
          <AppPaginationBar
            disabled={loading}
            page={pagination.page}
            totalPages={pagination.totalPages}
            pageSize={pagination.pageSize}
            totalItems={filteredUsers.length}
            itemLabel="users"
            onPageChange={pagination.setPage}
            onPageSizeChange={pagination.setPageSize}
          />
        }
      >
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
            {loading || filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              pagination.paginatedItems.map((user) => (
                <ManagedAccountRow
                  key={user.id}
                  deletingManagedUserId={deletingManagedUserId}
                  onBanToggle={onBanToggle}
                  onDelete={(nextUser) => setUserToDelete(nextUser)}
                  onEdit={onEditUser}
                  onResetPassword={onResetPassword}
                  onResendActivation={onResendActivation}
                  user={user}
                />
              ))
            )}
          </TableBody>
        </Table>
      </SideTabDataPanel>

      <AlertDialog
        open={userToDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setUserToDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Managed Account</AlertDialogTitle>
            <AlertDialogDescription>
              Delete <span className="font-medium">{userToDelete?.username || "this user"}</span>?
              Existing login access will be removed immediately. Activity and audit history remain
              available.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(deletingManagedUserId)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={Boolean(deletingManagedUserId) || !userToDelete}
              onClick={() => {
                if (userToDelete) {
                  onDeleteUser(userToDelete);
                }
              }}
            >
              {deletingManagedUserId ? "Deleting..." : "Delete User"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

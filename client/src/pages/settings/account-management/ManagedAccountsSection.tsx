import { useDeferredValue, useEffect, useMemo, useState } from "react";
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
import { ActiveFilterChips } from "@/components/data/ActiveFilterChips";
import { AppPaginationBar } from "@/components/data/AppPaginationBar";
import { MobileActionMenu } from "@/components/data/MobileActionMenu";
import { SideTabDataPanel } from "@/components/layout/SideTabDataPanel";
import { useIsMobile } from "@/hooks/use-mobile";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ManagedAccountRow } from "@/pages/settings/account-management/ManagedAccountRow";
import {
  formatDateTime,
  getStatusVariant,
  normalizeSearchValue,
} from "@/pages/settings/account-management/utils";
import type { ManagedUser } from "@/pages/settings/types";
import type { ManagedUsersPaginationState, ManagedUsersQueryState } from "@/pages/settings/useSettingsManagedUserData";

interface ManagedAccountsSectionProps {
  deletingManagedUserId: string | null;
  loading: boolean;
  managedUsers: ManagedUser[];
  pagination: ManagedUsersPaginationState;
  query: ManagedUsersQueryState;
  onBanToggle: (user: ManagedUser) => void;
  onDeleteUser: (user: ManagedUser) => void;
  onEditUser: (user: ManagedUser) => void;
  onQueryChange: (query: Partial<ManagedUsersQueryState>) => void;
  onRefresh: () => void;
  onResetPassword: (user: ManagedUser) => void;
  onResendActivation: (user: ManagedUser) => void;
}

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
  const [searchQuery, setSearchQuery] = useState(query.search);
  const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "user">(query.role);
  const [statusFilter, setStatusFilter] = useState<
    "all" | "active" | "pending_activation" | "suspended" | "disabled" | "locked" | "banned"
  >(query.status);
  const [userToDelete, setUserToDelete] = useState<ManagedUser | null>(null);
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const normalizedDeferredSearch = useMemo(
    () => normalizeSearchValue(deferredSearchQuery),
    [deferredSearchQuery],
  );
  const hasActiveFilters = normalizedDeferredSearch.length > 0 || roleFilter !== "all" || statusFilter !== "all";
  const activeFilters = useMemo(
    () =>
      [
        normalizedDeferredSearch
          ? {
              id: "managed-search",
              label: `Search: ${deferredSearchQuery.trim()}`,
              onRemove: () => setSearchQuery(""),
            }
          : null,
        roleFilter !== "all"
          ? {
              id: "managed-role",
              label: `Role: ${roleFilter}`,
              onRemove: () => {
                setRoleFilter("all");
                onQueryChange({
                  page: 1,
                  role: "all",
                });
              },
            }
          : null,
        statusFilter !== "all"
          ? {
              id: "managed-status",
              label: `Status: ${statusFilter}`,
              onRemove: () => {
                setStatusFilter("all");
                onQueryChange({
                  page: 1,
                  status: "all",
                });
              },
            }
          : null,
      ].filter((item): item is NonNullable<typeof item> => item !== null),
    [deferredSearchQuery, normalizedDeferredSearch, onQueryChange, roleFilter, statusFilter],
  );

  useEffect(() => {
    const normalizedSearchFromQuery = normalizeSearchValue(query.search);
    if (normalizeSearchValue(searchQuery) !== normalizedSearchFromQuery) {
      setSearchQuery(query.search);
    }
  }, [query.search, searchQuery]);

  useEffect(() => {
    if (roleFilter !== query.role) {
      setRoleFilter(query.role);
    }
  }, [query.role, roleFilter]);

  useEffect(() => {
    if (statusFilter !== query.status) {
      setStatusFilter(query.status);
    }
  }, [query.status, statusFilter]);

  useEffect(() => {
    if (normalizedDeferredSearch === normalizeSearchValue(query.search)) {
      return;
    }
    onQueryChange({
      page: 1,
      search: normalizedDeferredSearch,
    });
  }, [normalizedDeferredSearch, onQueryChange, query.search]);

  const emptyMessage = loading
    ? "Loading users..."
    : pagination.total === 0 && !hasActiveFilters
      ? "No managed accounts found."
      : "No managed accounts match the current filters.";

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
          <div className="space-y-3">
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_180px_180px]">
              <div className="space-y-2">
                <p className="text-sm font-medium">Search by user name</p>
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="search"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search username, full name, or email"
                    className="pl-9"
                    enterKeyHint="search"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="managed-accounts-role-filter" className="text-sm font-medium">
                  Role
                </label>
                <select
                  id="managed-accounts-role-filter"
                  value={roleFilter}
                  onChange={(event) => {
                    const nextRole = event.target.value === "admin" || event.target.value === "user"
                      ? event.target.value
                      : "all";
                    setRoleFilter(nextRole);
                    onQueryChange({
                      page: 1,
                      role: nextRole,
                    });
                  }}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="all">All roles</option>
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
              </div>
              <div className="space-y-2">
                <label htmlFor="managed-accounts-status-filter" className="text-sm font-medium">
                  Status
                </label>
                <select
                  id="managed-accounts-status-filter"
                  value={statusFilter}
                  onChange={(event) => {
                    const nextStatus =
                      event.target.value === "active"
                      || event.target.value === "pending_activation"
                      || event.target.value === "suspended"
                      || event.target.value === "disabled"
                      || event.target.value === "locked"
                      || event.target.value === "banned"
                        ? event.target.value
                        : "all";
                    setStatusFilter(nextStatus);
                    onQueryChange({
                      page: 1,
                      status: nextStatus,
                    });
                  }}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="all">All statuses</option>
                  <option value="active">active</option>
                  <option value="pending_activation">pending_activation</option>
                  <option value="suspended">suspended</option>
                  <option value="disabled">disabled</option>
                  <option value="locked">locked</option>
                  <option value="banned">banned</option>
                </select>
              </div>
            </div>
            <ActiveFilterChips
              items={activeFilters}
              onClearAll={
                hasActiveFilters
                  ? () => {
                      setSearchQuery("");
                      setRoleFilter("all");
                      setStatusFilter("all");
                      onQueryChange({
                        page: 1,
                        search: "",
                        role: "all",
                        status: "all",
                      });
                    }
                  : undefined
              }
            />
          </div>
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
                page: 1,
                pageSize,
              });
            }}
          />
        }
      >
        {isMobile ? (
          <div className="space-y-3 p-3">
            {loading || managedUsers.length === 0 ? (
              <div className="rounded-lg border border-border/60 bg-background/70 px-4 py-6 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </div>
            ) : (
              managedUsers.map((user) => (
                <div
                  key={user.id}
                  className="space-y-3 rounded-xl border border-border/70 bg-background/75 p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="break-words font-medium">{user.username}</div>
                      <div className="break-words text-xs text-muted-foreground">
                        {user.fullName || user.email || "No profile details"}
                      </div>
                    </div>
                    <MobileActionMenu
                      contentLabel="Managed account actions"
                      items={[
                        {
                          id: `resend-${user.id}`,
                          label: "Resend Activation",
                          onSelect: () => onResendActivation(user),
                          disabled: user.status !== "pending_activation" || Boolean(user.isBanned),
                        },
                        {
                          id: `ban-${user.id}`,
                          label: user.isBanned ? "Unban" : "Ban",
                          onSelect: () => onBanToggle(user),
                        },
                        {
                          id: `delete-${user.id}`,
                          label: deletingManagedUserId === user.id ? "Deleting..." : "Delete",
                          onSelect: () => setUserToDelete(user),
                          disabled: deletingManagedUserId === user.id,
                          destructive: true,
                        },
                      ]}
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary">{user.role}</Badge>
                    <Badge variant={getStatusVariant(user.status, user.isBanned)}>
                      {user.isBanned ? "banned" : user.status}
                    </Badge>
                    {user.lockedAt ? (
                      <Badge variant="destructive" title={user.lockedReason || "Account locked"}>
                        locked
                      </Badge>
                    ) : null}
                    {user.mustChangePassword ? <Badge variant="outline">must change password</Badge> : null}
                  </div>

                  <dl className="grid gap-2 rounded-lg border border-border/60 bg-muted/15 p-3 text-sm sm:grid-cols-2">
                    <div className="space-y-1">
                      <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Last Login</dt>
                      <dd>{formatDateTime(user.lastLoginAt)}</dd>
                    </div>
                    {user.lockedAt ? (
                      <div className="space-y-1">
                        <dt className="text-xs uppercase tracking-[0.14em] text-muted-foreground">Locked At</dt>
                        <dd>{formatDateTime(user.lockedAt)}</dd>
                      </div>
                    ) : null}
                  </dl>

                  <div className="grid gap-2 sm:flex sm:flex-row" data-floating-ai-avoid="true">
                    <Button variant="outline" className="w-full sm:w-auto" onClick={() => onEditUser(user)}>
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full sm:w-auto"
                      onClick={() => onResetPassword(user)}
                    >
                      Send Reset Email
                    </Button>
                    {user.status === "pending_activation" && !user.isBanned ? (
                      <Button
                        variant="outline"
                        className="w-full sm:w-auto"
                        onClick={() => onResendActivation(user)}
                      >
                        Resend Activation
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
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
        )}
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

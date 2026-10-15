import { Badge } from "@/components/ui/badge";
import { buildManagedAccountRowAriaLabel } from "./account-management-row-aria";
import { ManagedAccountsEmptyState } from "./ManagedAccountsEmptyState";
import { ManagedAccountListActions } from "./ManagedAccountListActions";
import { ManagedAccountLoginAccess } from "./ManagedAccountLoginAccess";
import type { ManagedAccountsEmptyStateContent } from "./managed-accounts-shared";
import { formatDateTime } from "./utils";
import type { ManagedUser } from "@/pages/settings/types";

type ManagedAccountsMobileListProps = {
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

export function ManagedAccountsMobileList({
  deletingManagedUserId, emptyState, loading, managedUsers,
  onBanToggle, onEditUser, onRequestDelete, onResetPassword, onResendActivation, onViewDetails, onClearFilters,
}: ManagedAccountsMobileListProps) {
  if (loading || managedUsers.length === 0) {
    return <ManagedAccountsEmptyState state={emptyState} onClearFilters={onClearFilters} />;
  }
  return (
    <div className="divide-y divide-border/70">
      {managedUsers.map((user) => {
        const lastLogin = user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "Never signed in";
        return (
          <article key={user.id} role="group" aria-label={buildManagedAccountRowAriaLabel({ formattedLastLoginAt: lastLogin, formattedLockedAt: user.lockedAt ? formatDateTime(user.lockedAt) : null, user })} className="min-w-0 space-y-3 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <h3 className="break-words text-sm font-semibold [overflow-wrap:anywhere]">{user.username}</h3>
                <p className="break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">{user.fullName || user.email || "No profile details"}</p>
              </div>
              <Badge variant="secondary" className="shrink-0 rounded-md font-normal capitalize">{user.role}</Badge>
            </div>
            <ManagedAccountLoginAccess user={user} />
            <p className="text-xs tabular-nums text-muted-foreground">Last login: {lastLogin}</p>
            <ManagedAccountListActions user={user} deletingManagedUserId={deletingManagedUserId} onBanToggle={onBanToggle} onDelete={onRequestDelete} onEdit={onEditUser} onResetPassword={onResetPassword} onResendActivation={onResendActivation} onViewDetails={onViewDetails} />
          </article>
        );
      })}
    </div>
  );
}

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MobileActionMenu } from "@/components/data/MobileActionMenu";
import { buildManagedAccountRowAriaLabel } from "@/pages/settings/account-management/account-management-row-aria";
import { formatDateTime, getStatusVariant } from "@/pages/settings/account-management/utils";
import type { ManagedUser } from "@/pages/settings/types";

type ManagedAccountsMobileListProps = {
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

export function ManagedAccountsMobileList({
  deletingManagedUserId,
  emptyMessage,
  loading,
  managedUsers,
  onBanToggle,
  onEditUser,
  onRequestDelete,
  onResetPassword,
  onResendActivation,
}: ManagedAccountsMobileListProps) {
  if (loading || managedUsers.length === 0) {
    return (
      <div className="space-y-3 p-3">
        <div className="rounded-lg border border-border/60 bg-background/70 px-4 py-6 text-center text-sm text-muted-foreground">
          {emptyMessage}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3">
      {managedUsers.map((user) => (
        <div
          key={user.id}
          aria-label={buildManagedAccountRowAriaLabel({
            formattedLastLoginAt: formatDateTime(user.lastLoginAt),
            formattedLockedAt: user.lockedAt ? formatDateTime(user.lockedAt) : null,
            user,
          })}
          className="space-y-3 rounded-xl border border-border/70 bg-background/75 p-4 shadow-sm"
          role="group"
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
                  onSelect: () => onRequestDelete(user),
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
      ))}
    </div>
  );
}

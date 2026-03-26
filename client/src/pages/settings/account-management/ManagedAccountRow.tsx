import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import type { ManagedUser } from "@/pages/settings/types";
import { formatDateTime, getStatusVariant } from "@/pages/settings/account-management/utils";

interface ManagedAccountRowProps {
  deletingManagedUserId: string | null;
  onBanToggle: (user: ManagedUser) => void;
  onDelete: (user: ManagedUser) => void;
  onEdit: (user: ManagedUser) => void;
  onResetPassword: (user: ManagedUser) => void;
  onResendActivation: (user: ManagedUser) => void;
  user: ManagedUser;
}

export const ManagedAccountRow = memo(function ManagedAccountRow({
  deletingManagedUserId,
  onBanToggle,
  onDelete,
  onEdit,
  onResetPassword,
  onResendActivation,
  user,
}: ManagedAccountRowProps) {
  return (
    <TableRow>
      <TableCell>
        <div className="space-y-1">
          <div className="font-medium">{user.username}</div>
          <div className="text-xs text-muted-foreground">
            {user.fullName || user.email || "No profile details"}
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="secondary">{user.role}</Badge>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-2">
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
        {user.lockedAt ? (
          <div className="mt-1 text-xs text-muted-foreground">
            Locked {formatDateTime(user.lockedAt)}
          </div>
        ) : null}
      </TableCell>
      <TableCell>{formatDateTime(user.lastLoginAt)}</TableCell>
      <TableCell className="text-right">
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onEdit(user)}>
            Edit
          </Button>
          <Button variant="outline" size="sm" onClick={() => onResetPassword(user)}>
            Send Reset Email
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onResendActivation(user)}
            disabled={user.status !== "pending_activation" || Boolean(user.isBanned)}
          >
            Resend Activation
          </Button>
          <Button variant="outline" size="sm" onClick={() => onBanToggle(user)}>
            {user.isBanned ? "Unban" : "Ban"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDelete(user)}
            disabled={deletingManagedUserId === user.id}
          >
            {deletingManagedUserId === user.id ? "Deleting..." : "Delete"}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
});

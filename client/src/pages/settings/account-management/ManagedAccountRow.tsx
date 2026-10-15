import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { buildManagedAccountRowAriaLabel } from "./account-management-row-aria";
import { ManagedAccountListActions } from "./ManagedAccountListActions";
import { ManagedAccountLoginAccess } from "./ManagedAccountLoginAccess";
import type { ManagedUser } from "@/pages/settings/types";
import { formatDateTime } from "./utils";

interface ManagedAccountRowProps {
  deletingManagedUserId: string | null;
  onBanToggle: (user: ManagedUser) => void;
  onDelete: (user: ManagedUser) => void;
  onEdit: (user: ManagedUser) => void;
  onResetPassword: (user: ManagedUser) => void;
  onResendActivation: (user: ManagedUser) => void;
  onViewDetails: (user: ManagedUser) => void;
  user: ManagedUser;
}

export const ManagedAccountRow = memo(function ManagedAccountRow({ user, ...actions }: ManagedAccountRowProps) {
  const formattedLastLoginAt = user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "Never signed in";
  return (
    <TableRow className="focus-within:bg-muted/30" aria-label={buildManagedAccountRowAriaLabel({ formattedLastLoginAt, formattedLockedAt: user.lockedAt ? formatDateTime(user.lockedAt) : null, user })}>
      <TableCell className="w-[20%] min-w-[10rem]">
        <div className="min-w-0 space-y-1">
          <div className="break-words font-medium [overflow-wrap:anywhere]">{user.username}</div>
          <div className="break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">{user.fullName || user.email || "No profile details"}</div>
        </div>
      </TableCell>
      <TableCell className="w-[12%]"><Badge variant="secondary" className="rounded-md font-normal capitalize">{user.role}</Badge></TableCell>
      <TableCell className="w-[28%] max-w-[20rem]"><ManagedAccountLoginAccess user={user} /></TableCell>
      <TableCell className="w-[20%] text-xs tabular-nums">{formattedLastLoginAt}</TableCell>
      <TableCell className="w-[20%] pr-20 text-right"><ManagedAccountListActions user={user} {...actions} /></TableCell>
    </TableRow>
  );
});

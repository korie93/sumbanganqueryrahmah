import { Fragment, useRef } from "react";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { buildManagedAccountListActions, type ManagedAccountListActionCallbacks } from "./managed-account-list-presentation";
import type { ManagedUser } from "@/pages/settings/types";
import { managedAccountDialogFocusHandoff } from "./managed-account-dialog-focus";

export function ManagedAccountListActions({ user, deletingManagedUserId, onViewDetails, onEdit, ...callbacks }: ManagedAccountListActionCallbacks & {
  user: ManagedUser;
  deletingManagedUserId: string | null;
  onViewDetails: (user: ManagedUser) => void;
  onEdit: (user: ManagedUser) => void;
}) {
  const selectedAction = useRef(false);
  const moreTriggerRef = useRef<HTMLButtonElement>(null);
  const actions = buildManagedAccountListActions({ user, deletingManagedUserId, ...callbacks });
  return (
    <div className="flex items-center justify-end gap-2 pr-16 sm:pr-0" data-floating-ai-avoid="true">
      <Button type="button" variant="outline" size="sm" className="sm:min-h-9" aria-label={`Details for ${user.username}`} aria-haspopup="dialog" onClick={() => onViewDetails(user)}>Details</Button>
      <Button type="button" variant="outline" size="sm" className="sm:min-h-9" aria-label={`Edit ${user.username}`} aria-haspopup="dialog" onClick={() => onEdit(user)}>Edit</Button>
      <DropdownMenu onOpenChange={(open) => { if (open) selectedAction.current = false; }}>
        <DropdownMenuTrigger asChild>
          <Button ref={moreTriggerRef} type="button" variant="outline" size="icon" aria-label={`More actions for ${user.username}`}><MoreHorizontal className="h-4 w-4" aria-hidden="true" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[min(17rem,calc(100vw-2rem))]" onCloseAutoFocus={(event) => {
          // Confirmation dialogs own autofocus after an action, not the closing menu.
          if (selectedAction.current) event.preventDefault();
          selectedAction.current = false;
        }}>
          <DropdownMenuLabel className="truncate">{user.username}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {actions.map((action) => (
            <Fragment key={action.id}>
              {action.destructive ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem disabled={action.disabled} title={action.description} className={cn("min-h-11 sm:min-h-9", action.destructive && "text-destructive focus:text-destructive")} onSelect={() => {
                if (action.disabled) return;
                selectedAction.current = action.id !== "resend";
                if (action.id !== "resend") {
                  managedAccountDialogFocusHandoff.setForDialog(user.id, action.id, moreTriggerRef.current);
                }
                action.onSelect();
              }}>{action.label}</DropdownMenuItem>
            </Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

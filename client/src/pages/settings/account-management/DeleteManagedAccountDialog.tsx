import { useRef } from "react";
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
import { ManagedAccountActionImpactList } from "@/pages/settings/account-management/ManagedAccountActionImpactList";
import { buildManagedAccountActionImpact } from "@/pages/settings/account-management/managed-accounts-utils";
import type { ManagedUser } from "@/pages/settings/types";
import { managedAccountDialogFocusHandoff } from "./managed-account-dialog-focus";

type DeleteManagedAccountDialogProps = {
  deletingManagedUserId: string | null;
  user: ManagedUser | null;
  onClose: () => void;
  onDeleteUser: (user: ManagedUser) => void;
};

export function DeleteManagedAccountDialog({
  deletingManagedUserId,
  user,
  onClose,
  onDeleteUser,
}: DeleteManagedAccountDialogProps) {
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const deleteImpactItems = buildManagedAccountActionImpact("delete");

  return (
    <AlertDialog
      open={user !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <AlertDialogContent className="flex min-w-0 flex-col gap-0 overflow-hidden p-0 sm:p-0" onOpenAutoFocus={() => {
        returnFocusRef.current = managedAccountDialogFocusHandoff.takeForDialog(user?.id, "delete");
      }} onCloseAutoFocus={(event) => {
        if (returnFocusRef.current?.isConnected) {
          event.preventDefault();
          returnFocusRef.current.focus({ preventScroll: true });
        }
      }}>
        {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- A named, visibly focused scroll region needs keyboard access to its static details. */}
        <div role="region" aria-label="Delete account action details" tabIndex={0} className="min-h-0 min-w-0 overflow-y-auto px-4 py-4 sm:px-6 [scrollbar-gutter:stable] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
        <AlertDialogHeader className="min-w-0 text-left">
          <AlertDialogTitle className="min-w-0 break-words">Delete Managed Account</AlertDialogTitle>
          <AlertDialogDescription className="min-w-0 break-words leading-6">
            Delete <span className="font-medium">{user?.username || "this user"}</span>?
            Existing login access will be removed immediately. Activity and audit history remain
            available.
          </AlertDialogDescription>
          <ManagedAccountActionImpactList items={deleteImpactItems} />
        </AlertDialogHeader>
        </div>
        <AlertDialogFooter className="shrink-0 gap-2 border-t border-border/70 px-4 py-3 sm:gap-2 sm:space-x-0 sm:px-6">
          <AlertDialogCancel className="mt-0 h-11 min-h-11 sm:min-h-11" disabled={Boolean(deletingManagedUserId)}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="h-11 min-h-11 sm:min-h-11"
            disabled={Boolean(deletingManagedUserId) || !user}
            onClick={() => {
              if (user) {
                onDeleteUser(user);
              }
            }}
          >
            {deletingManagedUserId ? "Deleting..." : "Delete User"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

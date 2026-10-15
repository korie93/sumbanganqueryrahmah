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
      <AlertDialogContent onOpenAutoFocus={() => {
        returnFocusRef.current = managedAccountDialogFocusHandoff.takeForDialog(user?.id, "delete");
      }} onCloseAutoFocus={(event) => {
        if (returnFocusRef.current?.isConnected) {
          event.preventDefault();
          returnFocusRef.current.focus({ preventScroll: true });
        }
      }}>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Managed Account</AlertDialogTitle>
          <AlertDialogDescription>
            Delete <span className="font-medium">{user?.username || "this user"}</span>?
            Existing login access will be removed immediately. Activity and audit history remain
            available.
          </AlertDialogDescription>
          <ManagedAccountActionImpactList items={deleteImpactItems} />
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={Boolean(deletingManagedUserId)}>Cancel</AlertDialogCancel>
          <AlertDialogAction
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

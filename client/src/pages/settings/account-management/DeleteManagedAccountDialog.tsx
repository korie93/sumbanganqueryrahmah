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
import type { ManagedUser } from "@/pages/settings/types";

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
  return (
    <AlertDialog
      open={user !== null}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete Managed Account</AlertDialogTitle>
          <AlertDialogDescription>
            Delete <span className="font-medium">{user?.username || "this user"}</span>?
            Existing login access will be removed immediately. Activity and audit history remain
            available.
          </AlertDialogDescription>
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

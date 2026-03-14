import { Button } from "@/components/ui/button";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { ManagedUser } from "@/pages/settings/types";

interface ManagedUserDialogProps {
  confirmCriticalOpen: boolean;
  managedDialogOpen: boolean;
  managedEmailInput: string;
  managedFullNameInput: string;
  managedIsBanned: boolean;
  managedRoleInput: "admin" | "user";
  managedSaving: boolean;
  managedSelectedUser: ManagedUser | null;
  managedStatusInput: "pending_activation" | "active" | "suspended" | "disabled";
  managedUsernameInput: string;
  onCloseManagedDialog: () => void;
  onConfirmCriticalOpenChange: (open: boolean) => void;
  onConfirmManagedSave: () => void;
  onManagedDialogOpenChange: (open: boolean) => void;
  onManagedEmailInputChange: (value: string) => void;
  onManagedFullNameInputChange: (value: string) => void;
  onManagedIsBannedChange: (value: boolean) => void;
  onManagedRoleInputChange: (value: "admin" | "user") => void;
  onManagedStatusInputChange: (
    value: "pending_activation" | "active" | "suspended" | "disabled",
  ) => void;
  onManagedUsernameInputChange: (value: string) => void;
  onSaveCriticalSettings: () => Promise<void>;
  saving: boolean;
}

export function ManagedUserDialog({
  confirmCriticalOpen,
  managedDialogOpen,
  managedEmailInput,
  managedFullNameInput,
  managedIsBanned,
  managedRoleInput,
  managedSaving,
  managedSelectedUser,
  managedStatusInput,
  managedUsernameInput,
  onCloseManagedDialog,
  onConfirmCriticalOpenChange,
  onConfirmManagedSave,
  onManagedDialogOpenChange,
  onManagedEmailInputChange,
  onManagedFullNameInputChange,
  onManagedIsBannedChange,
  onManagedRoleInputChange,
  onManagedStatusInputChange,
  onManagedUsernameInputChange,
  onSaveCriticalSettings,
  saving,
}: ManagedUserDialogProps) {
  return (
    <>
      <Dialog open={managedDialogOpen} onOpenChange={onManagedDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Managed Account</DialogTitle>
            <DialogDescription>
              Update account details for {managedSelectedUser?.username || "selected user"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Full Name</p>
              <Input
                value={managedFullNameInput}
                onChange={(event) => onManagedFullNameInputChange(event.target.value)}
                disabled={managedSaving}
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Username</p>
              <Input
                value={managedUsernameInput}
                onChange={(event) => onManagedUsernameInputChange(event.target.value)}
                disabled={managedSaving}
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Email</p>
              <Input
                value={managedEmailInput}
                onChange={(event) => onManagedEmailInputChange(event.target.value)}
                disabled={managedSaving}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <p className="text-sm font-medium">Role</p>
                <select
                  value={managedRoleInput}
                  onChange={(event) =>
                    onManagedRoleInputChange(event.target.value === "admin" ? "admin" : "user")
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  disabled={managedSaving}
                >
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Status</p>
                <select
                  value={managedStatusInput}
                  onChange={(event) =>
                    onManagedStatusInputChange(
                      event.target.value as
                        | "pending_activation"
                        | "active"
                        | "suspended"
                        | "disabled",
                    )
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  disabled={managedSaving}
                >
                  <option value="pending_activation">pending_activation</option>
                  <option value="active">active</option>
                  <option value="suspended">suspended</option>
                  <option value="disabled">disabled</option>
                </select>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Banned</p>
                <select
                  value={managedIsBanned ? "true" : "false"}
                  onChange={(event) => onManagedIsBannedChange(event.target.value === "true")}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  disabled={managedSaving}
                >
                  <option value="false">not banned</option>
                  <option value="true">banned</option>
                </select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={onCloseManagedDialog} disabled={managedSaving}>
              Cancel
            </Button>
            <Button onClick={onConfirmManagedSave} disabled={managedSaving}>
              {managedSaving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmCriticalOpen} onOpenChange={onConfirmCriticalOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Critical Change</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to update critical system settings. Continue only if this change has been validated.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              onClick={async () => {
                onConfirmCriticalOpenChange(false);
                await onSaveCriticalSettings();
              }}
            >
              Yes, Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

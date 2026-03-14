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
  managedConfirmPasswordInput: string;
  managedDialogOpen: boolean;
  managedPasswordInput: string;
  managedSaving: boolean;
  managedSelectedUser: ManagedUser | null;
  managedUsernameInput: string;
  onCloseManagedDialog: () => void;
  onConfirmCriticalOpenChange: (open: boolean) => void;
  onConfirmManagedSave: () => void;
  onManagedConfirmPasswordInputChange: (value: string) => void;
  onManagedDialogOpenChange: (open: boolean) => void;
  onManagedPasswordInputChange: (value: string) => void;
  onManagedUsernameInputChange: (value: string) => void;
  onSaveCriticalSettings: () => Promise<void>;
  saving: boolean;
}

export function ManagedUserDialog({
  confirmCriticalOpen,
  managedConfirmPasswordInput,
  managedDialogOpen,
  managedPasswordInput,
  managedSaving,
  managedSelectedUser,
  managedUsernameInput,
  onCloseManagedDialog,
  onConfirmCriticalOpenChange,
  onConfirmManagedSave,
  onManagedConfirmPasswordInputChange,
  onManagedDialogOpenChange,
  onManagedPasswordInputChange,
  onManagedUsernameInputChange,
  onSaveCriticalSettings,
  saving,
}: ManagedUserDialogProps) {
  return (
    <>
      <Dialog open={managedDialogOpen} onOpenChange={onManagedDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit credentials</DialogTitle>
            <DialogDescription>
              Update username and/or password for {managedSelectedUser?.username || "selected user"}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Username</p>
              <Input
                value={managedUsernameInput}
                onChange={(event) => onManagedUsernameInputChange(event.target.value)}
                disabled={managedSaving}
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">New Password</p>
              <Input
                type="password"
                value={managedPasswordInput}
                onChange={(event) => onManagedPasswordInputChange(event.target.value)}
                disabled={managedSaving}
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Confirm Password</p>
              <Input
                type="password"
                value={managedConfirmPasswordInput}
                onChange={(event) => onManagedConfirmPasswordInputChange(event.target.value)}
                disabled={managedSaving}
              />
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

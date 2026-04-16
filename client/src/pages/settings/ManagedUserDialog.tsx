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
import { logClientError } from "@/lib/client-logger";
import type { ManagedUser } from "@/pages/settings/types";

export interface ManagedUserDialogProps {
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
  const handleConfirmCriticalSave = () => {
    onConfirmCriticalOpenChange(false);
    void onSaveCriticalSettings().catch((error: unknown) => {
      logClientError("Managed user critical save confirmation failed", error, {
        source: "client.log",
        component: "ManagedUserDialog",
      });
    });
  };

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
              <label htmlFor="managed-user-full-name" className="text-sm font-medium">
                Full Name
              </label>
              <Input
                id="managed-user-full-name"
                name="managedUserFullName"
                autoComplete="name"
                value={managedFullNameInput}
                onChange={(event) => onManagedFullNameInputChange(event.target.value)}
                disabled={managedSaving}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="managed-user-username" className="text-sm font-medium">
                Username
              </label>
              <Input
                id="managed-user-username"
                name="managedUserUsername"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={managedUsernameInput}
                onChange={(event) => onManagedUsernameInputChange(event.target.value)}
                disabled={managedSaving}
              />
            </div>
            <div className="space-y-2">
              <label htmlFor="managed-user-email" className="text-sm font-medium">
                Email
              </label>
              <Input
                id="managed-user-email"
                name="managedUserEmail"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={managedEmailInput}
                onChange={(event) => onManagedEmailInputChange(event.target.value)}
                disabled={managedSaving}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <label htmlFor="managed-user-role" className="text-sm font-medium">
                  Role
                </label>
                <select
                  id="managed-user-role"
                  name="managedUserRole"
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
                <label htmlFor="managed-user-status" className="text-sm font-medium">
                  Status
                </label>
                <select
                  id="managed-user-status"
                  name="managedUserStatus"
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
                <label htmlFor="managed-user-banned" className="text-sm font-medium">
                  Banned
                </label>
                <select
                  id="managed-user-banned"
                  name="managedUserBanned"
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
              onClick={handleConfirmCriticalSave}
            >
              Yes, Save
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

import { useRef } from "react";
import { AlertTriangle } from "lucide-react";
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
import { managedAccountDialogFocusHandoff } from "@/pages/settings/account-management/managed-account-dialog-focus";
import type { ManagedUser } from "@/pages/settings/types";
import type { ManageableUserRole } from "@shared/user-roles";

export interface ManagedUserDialogProps {
  confirmCriticalOpen: boolean;
  managedDialogOpen: boolean;
  managedEmailInput: string;
  managedFullNameInput: string;
  managedIsBanned: boolean;
  managedRoleInput: ManageableUserRole;
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
  onManagedRoleInputChange: (value: ManageableUserRole) => void;
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
  const fullNameInputRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  return (
    <>
      <Dialog open={managedDialogOpen} onOpenChange={onManagedDialogOpenChange}>
        <DialogContent className="flex max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:p-0" onOpenAutoFocus={(event) => {
          event.preventDefault();
          returnFocusRef.current = managedAccountDialogFocusHandoff.takeForDialog(managedSelectedUser?.id, "edit")
            ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
          fullNameInputRef.current?.focus();
        }} onCloseAutoFocus={(event) => {
          if (returnFocusRef.current?.isConnected) {
            event.preventDefault();
            returnFocusRef.current.focus({ preventScroll: true });
          }
        }}>
          <DialogHeader className="shrink-0 border-b border-border/70 px-4 py-4 pr-12 text-left sm:px-6">
            <DialogTitle>Edit Managed Account</DialogTitle>
            <DialogDescription>
              Update account details for {managedSelectedUser?.username || "selected user"}.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 space-y-4 overflow-y-auto px-4 py-4 sm:px-6 [scrollbar-gutter:stable]">
            <div className="flex gap-2 rounded-md border border-amber-600/40 bg-amber-500/10 px-3 py-2.5 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>Role, status and ban changes affect this account&apos;s access. An existing login lock is not removed by changing the account record.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <label htmlFor="managed-user-full-name" className="text-sm font-medium">
                Full Name
              </label>
              <Input
                ref={fullNameInputRef}
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
            <div className="space-y-2 sm:col-span-2">
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
                    onManagedRoleInputChange(
                      event.target.value === "admin" || event.target.value === "manager"
                        ? event.target.value
                        : "user",
                    )
                  }
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  disabled={managedSaving}
                >
                  <option value="user">User</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="space-y-2">
                <label htmlFor="managed-user-status" className="text-sm font-medium">
                  Account record status
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
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  disabled={managedSaving}
                >
                  <option value="pending_activation">Pending activation</option>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="disabled">Disabled</option>
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
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  disabled={managedSaving}
                >
                  <option value="false">Not banned</option>
                  <option value="true">Banned</option>
                </select>
              </div>
            </div>
          </div>
          <DialogFooter className="shrink-0 flex-row justify-end gap-2 border-t border-border/70 px-4 py-3 sm:gap-2 sm:space-x-0 sm:px-6">
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

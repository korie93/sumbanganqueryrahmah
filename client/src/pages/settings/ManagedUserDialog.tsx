import { useEffect, useRef } from "react";
import { AlertTriangle, CircleAlert } from "lucide-react";
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
import { getAriaInvalidProps } from "@/lib/aria-state-props";
import { managedAccountDialogFocusHandoff } from "@/pages/settings/account-management/managed-account-dialog-focus";
import { getManagedUserEditState } from "@/pages/settings/managed-user-edit-state";
import type { ManagedUser, ManagedUserSaveError } from "@/pages/settings/types";
import type { ManageableUserRole } from "@shared/user-roles";

export interface ManagedUserDialogProps {
  confirmCriticalOpen: boolean;
  managedDialogOpen: boolean;
  managedEmailInput: string;
  managedFullNameInput: string;
  managedIsBanned: boolean;
  managedRoleInput: ManageableUserRole;
  managedSaving: boolean;
  managedSaveError: ManagedUserSaveError | null;
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
  managedSaveError,
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
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const editState = getManagedUserEditState(managedSelectedUser, {
    fullName: managedFullNameInput, username: managedUsernameInput, email: managedEmailInput,
    role: managedRoleInput, status: managedStatusInput, isBanned: managedIsBanned,
  });
  const saveFeedback = managedSaving ? "Saving account changes..."
    : !editState.hasChanges ? "No changes to save."
    : !editState.canSave ? "Check the highlighted fields before saving."
    : "Changes ready to save.";
  useEffect(() => {
    // Disabling the focused Save button while pending can drop focus to body.
    // Restore that keyboard context on failure, but never take focus from a
    // control the user has deliberately reached (including Close).
    if (managedDialogOpen && managedSaveError && !managedSaving && document.activeElement === document.body) {
      saveButtonRef.current?.focus({ preventScroll: true });
    }
  }, [managedDialogOpen, managedSaveError, managedSaving]);
  return (
    <>
      <Dialog open={managedDialogOpen} onOpenChange={onManagedDialogOpenChange}>
        <DialogContent className="flex min-w-0 max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:p-0 [&>button]:right-2 [&>button]:top-2 [&>button]:inline-flex [&>button]:min-h-11 [&>button]:min-w-11 [&>button]:items-center [&>button]:justify-center" onOpenAutoFocus={(event) => {
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
          <DialogHeader className="min-w-0 shrink-0 border-b border-border/70 px-4 py-4 pr-12 text-left sm:px-6 sm:pr-12">
            <DialogTitle>Edit Managed Account</DialogTitle>
            <DialogDescription className="min-w-0 break-words">
              Update account details for {managedSelectedUser?.username || "selected user"}.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 min-w-0 space-y-4 overflow-y-auto px-4 py-4 sm:px-6 [scrollbar-gutter:stable]">
            <div className="flex gap-2 rounded-md border border-amber-600/40 bg-amber-500/10 px-3 py-2.5 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <p>Role, status and ban changes affect this account&apos;s access. An existing login lock is not removed by changing the account record.</p>
            </div>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <div className="min-w-0 space-y-2">
              <label htmlFor="managed-user-full-name" className="block min-w-0 text-sm font-medium leading-5">
                Full Name
              </label>
              <Input
                ref={fullNameInputRef}
                id="managed-user-full-name"
                name="managedUserFullName"
                className="h-11 min-h-11 min-w-0 sm:h-11 sm:min-h-11"
                autoComplete="name"
                value={managedFullNameInput}
                onChange={(event) => onManagedFullNameInputChange(event.target.value)}
                disabled={managedSaving}
              />
            </div>
            <div className="min-w-0 space-y-2">
              <label htmlFor="managed-user-username" className="block min-w-0 text-sm font-medium leading-5">
                Username
              </label>
              <Input
                id="managed-user-username"
                name="managedUserUsername"
                className="h-11 min-h-11 min-w-0 sm:h-11 sm:min-h-11 aria-[invalid=true]:border-destructive"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={managedUsernameInput}
                {...getAriaInvalidProps(Boolean(editState.errors.username))}
                aria-describedby={editState.errors.username ? "managed-user-username-error" : undefined}
                onChange={(event) => onManagedUsernameInputChange(event.target.value)}
                disabled={managedSaving}
              />
              {editState.errors.username && (
                <p id="managed-user-username-error" className="break-words text-sm leading-5 text-destructive">{editState.errors.username}</p>
              )}
            </div>
            <div className="min-w-0 space-y-2 sm:col-span-2">
              <label htmlFor="managed-user-email" className="block min-w-0 text-sm font-medium leading-5">
                Email
              </label>
              <Input
                id="managed-user-email"
                name="managedUserEmail"
                className="h-11 min-h-11 min-w-0 sm:h-11 sm:min-h-11 aria-[invalid=true]:border-destructive"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={managedEmailInput}
                {...getAriaInvalidProps(Boolean(editState.errors.email))}
                aria-describedby={editState.errors.email ? "managed-user-email-error" : undefined}
                onChange={(event) => onManagedEmailInputChange(event.target.value)}
                disabled={managedSaving}
              />
              {editState.errors.email && (
                <p id="managed-user-email-error" className="break-words text-sm leading-5 text-destructive">{editState.errors.email}</p>
              )}
            </div>
            </div>
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="min-w-0 space-y-2">
                <label htmlFor="managed-user-role" className="block min-w-0 text-sm font-medium leading-5">
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
                  className="h-11 min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base md:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  disabled={managedSaving}
                >
                  <option value="user">User</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
              <div className="min-w-0 space-y-2">
                <label htmlFor="managed-user-status" className="block min-w-0 text-sm font-medium leading-5">
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
                  className="h-11 min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base md:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  disabled={managedSaving}
                >
                  <option value="pending_activation">Pending activation</option>
                  <option value="active">Active</option>
                  <option value="suspended">Suspended</option>
                  <option value="disabled">Disabled</option>
                </select>
              </div>
              <div className="min-w-0 space-y-2">
                <label htmlFor="managed-user-banned" className="block min-w-0 text-sm font-medium leading-5">
                  Banned
                </label>
                <select
                  id="managed-user-banned"
                  name="managedUserBanned"
                  value={managedIsBanned ? "true" : "false"}
                  onChange={(event) => onManagedIsBannedChange(event.target.value === "true")}
                  className="h-11 min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base md:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  disabled={managedSaving}
                >
                  <option value="false">Not banned</option>
                  <option value="true">Banned</option>
                </select>
              </div>
            </div>
          </div>
          <DialogFooter className="shrink-0 flex-col gap-2 border-t border-border/70 px-4 py-3 sm:flex-col sm:gap-2 sm:space-x-0 sm:px-6">
            {managedSaveError && !managedSaving ? (
              // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- A visibly focused error region needs keyboard scrolling for long server messages.
              <div id="managed-user-save-error" role="alert" aria-label="Account update error" tabIndex={0} className="flex max-h-[min(10rem,25dvh)] min-w-0 gap-2 overflow-y-auto rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-left text-sm leading-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                <div id="managed-user-save-error-details" className="min-w-0 space-y-1 break-words">
                  <p className="font-semibold">Unable to complete this update</p>
                  <p>{managedSaveError.message}</p>
                  {managedSaveError.requestId && <p className="break-all font-mono text-xs">Reference: {managedSaveError.requestId}</p>}
                </div>
              </div>
            ) : (
            <p id="managed-user-save-feedback" className="min-w-0 break-words text-sm leading-5 text-muted-foreground" role="status" aria-live="polite" aria-atomic="true">{saveFeedback}</p>
            )}
            <div className="flex justify-end gap-2">
            <Button variant="outline" className="h-11 min-h-11 sm:min-h-11" onClick={onCloseManagedDialog} disabled={managedSaving}>
              Cancel
            </Button>
            <Button ref={saveButtonRef} className="h-11 min-h-11 sm:min-h-11" onClick={onConfirmManagedSave} disabled={managedSaving || !editState.canSave} aria-describedby={managedSaveError && !managedSaving ? "managed-user-save-error-details" : "managed-user-save-feedback"}>
              {managedSaving ? "Saving..." : "Save"}
            </Button>
            </div>
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

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
import {
  buildManagedAccountActionImpact,
  resolveManagedAccountBanAction,
} from "@/pages/settings/account-management/managed-accounts-utils";
import type { ManagedUser } from "@/pages/settings/types";
import { managedAccountDialogFocusHandoff } from "./managed-account-dialog-focus";

type ManagedAccountActionDialogsProps = {
  banToggleUser: ManagedUser | null;
  resetPasswordUser: ManagedUser | null;
  onCloseBanToggle: () => void;
  onCloseResetPassword: () => void;
  onConfirmBanToggle: (user: ManagedUser) => void;
  onConfirmResetPassword: (user: ManagedUser) => void;
};

export function ManagedAccountActionDialogs({
  banToggleUser,
  resetPasswordUser,
  onCloseBanToggle,
  onCloseResetPassword,
  onConfirmBanToggle,
  onConfirmResetPassword,
}: ManagedAccountActionDialogsProps) {
  const resetReturnFocusRef = useRef<HTMLElement | null>(null);
  const banReturnFocusRef = useRef<HTMLElement | null>(null);
  const banAction = resolveManagedAccountBanAction(banToggleUser);
  const nextBanAction = banAction === "unban" ? "Unban" : "Ban";
  const resetImpactItems = buildManagedAccountActionImpact("reset-password");
  const banImpactItems = buildManagedAccountActionImpact(banAction);

  return (
    <>
      <AlertDialog
        open={resetPasswordUser !== null}
        onOpenChange={(open) => {
          if (!open) {
            onCloseResetPassword();
          }
        }}
      >
        <AlertDialogContent className="flex min-w-0 flex-col gap-0 overflow-hidden p-0 sm:p-0" onOpenAutoFocus={() => {
          resetReturnFocusRef.current = managedAccountDialogFocusHandoff.takeForDialog(resetPasswordUser?.id, "reset");
        }} onCloseAutoFocus={(event) => {
          if (resetReturnFocusRef.current?.isConnected) {
            event.preventDefault();
            resetReturnFocusRef.current.focus({ preventScroll: true });
          }
        }}>
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- A named, visibly focused scroll region needs keyboard access to its static details. */}
          <div role="region" aria-label="Password reset action details" tabIndex={0} className="min-h-0 min-w-0 overflow-y-auto px-4 py-4 sm:px-6 [scrollbar-gutter:stable] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
          <AlertDialogHeader className="min-w-0 text-left">
            <AlertDialogTitle className="min-w-0 break-words">Send Password Reset Email</AlertDialogTitle>
            <AlertDialogDescription className="min-w-0 break-words leading-6">
              Send a password reset email to{" "}
              <span className="font-medium">{resetPasswordUser?.username || "this user"}</span>?
              The user will need to follow the reset link before choosing a new password.
            </AlertDialogDescription>
            <ManagedAccountActionImpactList items={resetImpactItems} />
          </AlertDialogHeader>
          </div>
          <AlertDialogFooter className="shrink-0 gap-2 border-t border-border/70 px-4 py-3 sm:gap-2 sm:space-x-0 sm:px-6">
            <AlertDialogCancel className="mt-0 h-11 min-h-11 sm:min-h-11">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="h-11 min-h-11 sm:min-h-11"
              disabled={!resetPasswordUser}
              onClick={() => {
                if (resetPasswordUser) {
                  onConfirmResetPassword(resetPasswordUser);
                }
              }}
            >
              Send Reset Email
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={banToggleUser !== null}
        onOpenChange={(open) => {
          if (!open) {
            onCloseBanToggle();
          }
        }}
      >
        <AlertDialogContent className="flex min-w-0 flex-col gap-0 overflow-hidden p-0 sm:p-0" onOpenAutoFocus={() => {
          banReturnFocusRef.current = managedAccountDialogFocusHandoff.takeForDialog(banToggleUser?.id, "ban");
        }} onCloseAutoFocus={(event) => {
          if (banReturnFocusRef.current?.isConnected) {
            event.preventDefault();
            banReturnFocusRef.current.focus({ preventScroll: true });
          }
        }}>
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- A named, visibly focused scroll region needs keyboard access to its static details. */}
          <div role="region" aria-label={`${nextBanAction} account action details`} tabIndex={0} className="min-h-0 min-w-0 overflow-y-auto px-4 py-4 sm:px-6 [scrollbar-gutter:stable] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
          <AlertDialogHeader className="min-w-0 text-left">
            <AlertDialogTitle className="min-w-0 break-words">{nextBanAction} Managed Account</AlertDialogTitle>
            <AlertDialogDescription className="min-w-0 break-words leading-6">
              {nextBanAction}{" "}
              <span className="font-medium">{banToggleUser?.username || "this user"}</span>?
              {banToggleUser?.isBanned
                ? " This will restore the account's ability to sign in if the rest of the account state allows it."
                : " This will block the account from signing in until it is unbanned."}
            </AlertDialogDescription>
            <ManagedAccountActionImpactList items={banImpactItems} />
          </AlertDialogHeader>
          </div>
          <AlertDialogFooter className="shrink-0 gap-2 border-t border-border/70 px-4 py-3 sm:gap-2 sm:space-x-0 sm:px-6">
            <AlertDialogCancel className="mt-0 h-11 min-h-11 sm:min-h-11">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="h-11 min-h-11 sm:min-h-11"
              disabled={!banToggleUser}
              onClick={() => {
                if (banToggleUser) {
                  onConfirmBanToggle(banToggleUser);
                }
              }}
            >
              {nextBanAction}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

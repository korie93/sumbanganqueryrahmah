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
  const nextBanAction = banToggleUser?.isBanned ? "Unban" : "Ban";

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
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send Password Reset Email</AlertDialogTitle>
            <AlertDialogDescription>
              Send a password reset email to{" "}
              <span className="font-medium">{resetPasswordUser?.username || "this user"}</span>?
              The user will need to follow the reset link before choosing a new password.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
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
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{nextBanAction} Managed Account</AlertDialogTitle>
            <AlertDialogDescription>
              {nextBanAction}{" "}
              <span className="font-medium">{banToggleUser?.username || "this user"}</span>?
              {banToggleUser?.isBanned
                ? " This will restore the account's ability to sign in if the rest of the account state allows it."
                : " This will block the account from signing in until it is unbanned."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
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

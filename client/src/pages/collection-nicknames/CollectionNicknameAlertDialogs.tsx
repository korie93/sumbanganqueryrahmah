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
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { CollectionNicknameDialogsProps } from "@/pages/collection-nicknames/collection-nickname-dialog-types";

type CollectionNicknameAlertDialogsProps = Pick<
  CollectionNicknameDialogsProps,
  | "pendingDeactivate"
  | "statusBusyId"
  | "pendingDeleteGroup"
  | "deletingGroup"
  | "pendingDeleteNickname"
  | "deletingNicknameId"
  | "pendingResetPassword"
  | "resettingNicknameId"
  | "pendingUngroup"
  | "ungrouping"
  | "confirmSwitchOpen"
  | "onPendingDeactivateOpenChange"
  | "onConfirmDeactivate"
  | "onPendingDeleteGroupOpenChange"
  | "onConfirmDeleteGroup"
  | "onPendingDeleteNicknameOpenChange"
  | "onConfirmDeleteNickname"
  | "onPendingResetPasswordOpenChange"
  | "onConfirmResetPassword"
  | "onPendingUngroupOpenChange"
  | "onConfirmUngroup"
  | "onConfirmSwitchOpenChange"
  | "onConfirmSwitch"
>;

export function CollectionNicknameAlertDialogs({
  pendingDeactivate,
  statusBusyId,
  pendingDeleteGroup,
  deletingGroup,
  pendingDeleteNickname,
  deletingNicknameId,
  pendingResetPassword,
  resettingNicknameId,
  pendingUngroup,
  ungrouping,
  confirmSwitchOpen,
  onPendingDeactivateOpenChange,
  onConfirmDeactivate,
  onPendingDeleteGroupOpenChange,
  onConfirmDeleteGroup,
  onPendingDeleteNicknameOpenChange,
  onConfirmDeleteNickname,
  onPendingResetPasswordOpenChange,
  onConfirmResetPassword,
  onPendingUngroupOpenChange,
  onConfirmUngroup,
  onConfirmSwitchOpenChange,
  onConfirmSwitch,
}: CollectionNicknameAlertDialogsProps) {
  return (
    <>
      <Dialog open={Boolean(pendingDeactivate)} onOpenChange={onPendingDeactivateOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nyahaktif Nickname</DialogTitle>
            <DialogDescription>Adakah anda pasti mahu nyahaktif nickname ini?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => onPendingDeactivateOpenChange(false)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={onConfirmDeactivate}
              disabled={!pendingDeactivate || statusBusyId === pendingDeactivate.id}
            >
              {pendingDeactivate && statusBusyId === pendingDeactivate.id ? "Processing..." : "Nyahaktif"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(pendingDeleteGroup)} onOpenChange={onPendingDeleteGroupOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Padam Admin Group</AlertDialogTitle>
            <AlertDialogDescription>Adakah anda pasti mahu padam group ini?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingGroup}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmDeleteGroup} disabled={deletingGroup}>
              {deletingGroup ? "Processing..." : "Padam"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(pendingDeleteNickname)} onOpenChange={onPendingDeleteNicknameOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Padam Nickname</AlertDialogTitle>
            <AlertDialogDescription>
              Jika nickname sedang digunakan, sistem akan nyahaktifkan secara selamat.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(deletingNicknameId)}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirmDeleteNickname}
              disabled={!pendingDeleteNickname || Boolean(deletingNicknameId)}
            >
              {deletingNicknameId ? "Processing..." : "Padam"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(pendingResetPassword)} onOpenChange={onPendingResetPasswordOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset Password Nickname</AlertDialogTitle>
            <AlertDialogDescription>Adakah anda pasti mahu reset password nickname ini?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(resettingNicknameId)}>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirmResetPassword}
              disabled={!pendingResetPassword || Boolean(resettingNicknameId)}
            >
              {resettingNicknameId ? "Processing..." : "Reset Password"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(pendingUngroup)} onOpenChange={onPendingUngroupOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ungroup Nickname</AlertDialogTitle>
            <AlertDialogDescription>
              Adakah anda pasti mahu buang nickname ini daripada grouping admin ini?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmUngroup} disabled={ungrouping}>
              {ungrouping ? "Processing..." : "Buang"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmSwitchOpen} onOpenChange={onConfirmSwitchOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Perubahan Belum Disimpan</AlertDialogTitle>
            <AlertDialogDescription>
              Perubahan belum disimpan. Adakah anda mahu teruskan tanpa simpan?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmSwitch}>Teruskan</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

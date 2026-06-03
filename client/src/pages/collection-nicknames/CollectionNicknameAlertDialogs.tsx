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
import { useIsMobile } from "@/hooks/use-mobile";
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
  const isMobile = useIsMobile();

  return (
    <>
      <Dialog open={Boolean(pendingDeactivate)} onOpenChange={onPendingDeactivateOpenChange}>
        <DialogContent
          className={isMobile ? "max-w-md rounded-[1.5rem] border-border/60 p-5 pt-6 shadow-2xl" : "max-w-md"}
          data-floating-ai-avoid="true"
        >
          <DialogHeader className={isMobile ? "pr-8 text-left" : ""}>
            <DialogTitle>Nyahaktif Nickname</DialogTitle>
            <DialogDescription>Adakah anda pasti mahu nyahaktif nickname ini?</DialogDescription>
          </DialogHeader>
          <DialogFooter className={isMobile ? "gap-3 pt-2" : ""}>
            <Button
              variant="outline"
              onClick={() => onPendingDeactivateOpenChange(false)}
              className={isMobile ? "h-11 w-full rounded-xl" : ""}
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              onClick={onConfirmDeactivate}
              disabled={!pendingDeactivate || statusBusyId === pendingDeactivate.id}
              className={isMobile ? "h-11 w-full rounded-xl" : ""}
            >
              {pendingDeactivate && statusBusyId === pendingDeactivate.id ? "Processing..." : "Nyahaktif"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(pendingDeleteGroup)} onOpenChange={onPendingDeleteGroupOpenChange}>
        <AlertDialogContent
          className={isMobile ? "rounded-[1.5rem] border-border/60 p-5 pt-6 shadow-2xl" : ""}
          data-floating-ai-avoid="true"
        >
          <AlertDialogHeader className={isMobile ? "text-left" : ""}>
            <AlertDialogTitle>Padam Admin Group</AlertDialogTitle>
            <AlertDialogDescription>Adakah anda pasti mahu padam group ini?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className={isMobile ? "gap-3 pt-2" : ""}>
            <AlertDialogCancel
              disabled={deletingGroup}
              className={isMobile ? "mt-0 h-11 w-full rounded-xl" : ""}
            >
              Batal
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirmDeleteGroup}
              disabled={deletingGroup}
              className={isMobile ? "h-11 w-full rounded-xl" : ""}
            >
              {deletingGroup ? "Processing..." : "Padam"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(pendingDeleteNickname)} onOpenChange={onPendingDeleteNicknameOpenChange}>
        <AlertDialogContent
          className={isMobile ? "rounded-[1.5rem] border-border/60 p-5 pt-6 shadow-2xl" : ""}
          data-floating-ai-avoid="true"
        >
          <AlertDialogHeader className={isMobile ? "text-left" : ""}>
            <AlertDialogTitle>Padam Nickname</AlertDialogTitle>
            <AlertDialogDescription>
              Jika nickname sedang digunakan, sistem akan nyahaktifkan secara selamat.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className={isMobile ? "gap-3 pt-2" : ""}>
            <AlertDialogCancel
              disabled={Boolean(deletingNicknameId)}
              className={isMobile ? "mt-0 h-11 w-full rounded-xl" : ""}
            >
              Batal
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirmDeleteNickname}
              disabled={!pendingDeleteNickname || Boolean(deletingNicknameId)}
              className={isMobile ? "h-11 w-full rounded-xl" : ""}
            >
              {deletingNicknameId ? "Processing..." : "Padam"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(pendingResetPassword)} onOpenChange={onPendingResetPasswordOpenChange}>
        <AlertDialogContent
          className={isMobile ? "rounded-[1.5rem] border-border/60 p-5 pt-6 shadow-2xl" : ""}
          data-floating-ai-avoid="true"
        >
          <AlertDialogHeader className={isMobile ? "text-left" : ""}>
            <AlertDialogTitle>Reset Password Nickname</AlertDialogTitle>
            <AlertDialogDescription>Adakah anda pasti mahu reset password nickname ini?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className={isMobile ? "gap-3 pt-2" : ""}>
            <AlertDialogCancel
              disabled={Boolean(resettingNicknameId)}
              className={isMobile ? "mt-0 h-11 w-full rounded-xl" : ""}
            >
              Batal
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirmResetPassword}
              disabled={!pendingResetPassword || Boolean(resettingNicknameId)}
              className={isMobile ? "h-11 w-full rounded-xl" : ""}
            >
              {resettingNicknameId ? "Processing..." : "Reset Password"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(pendingUngroup)} onOpenChange={onPendingUngroupOpenChange}>
        <AlertDialogContent
          className={isMobile ? "rounded-[1.5rem] border-border/60 p-5 pt-6 shadow-2xl" : ""}
          data-floating-ai-avoid="true"
        >
          <AlertDialogHeader className={isMobile ? "text-left" : ""}>
            <AlertDialogTitle>Ungroup Nickname</AlertDialogTitle>
            <AlertDialogDescription>
              Adakah anda pasti mahu buang nickname ini daripada grouping admin ini?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className={isMobile ? "gap-3 pt-2" : ""}>
            <AlertDialogCancel className={isMobile ? "mt-0 h-11 w-full rounded-xl" : ""}>
              Batal
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirmUngroup}
              disabled={ungrouping}
              className={isMobile ? "h-11 w-full rounded-xl" : ""}
            >
              {ungrouping ? "Processing..." : "Buang"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmSwitchOpen} onOpenChange={onConfirmSwitchOpenChange}>
        <AlertDialogContent
          className={isMobile ? "rounded-[1.5rem] border-border/60 p-5 pt-6 shadow-2xl" : ""}
          data-floating-ai-avoid="true"
        >
          <AlertDialogHeader className={isMobile ? "text-left" : ""}>
            <AlertDialogTitle>Perubahan Belum Disimpan</AlertDialogTitle>
            <AlertDialogDescription>
              Perubahan belum disimpan. Adakah anda mahu teruskan tanpa simpan?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className={isMobile ? "gap-3 pt-2" : ""}>
            <AlertDialogCancel className={isMobile ? "mt-0 h-11 w-full rounded-xl" : ""}>
              Batal
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirmSwitch}
              className={isMobile ? "h-11 w-full rounded-xl" : ""}
            >
              Teruskan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

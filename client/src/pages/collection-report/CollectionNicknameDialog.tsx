import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CollectionNicknameDialogActions } from "@/pages/collection-report/CollectionNicknameDialogActions";
import { CollectionNicknameDialogStepFields } from "@/pages/collection-report/CollectionNicknameDialogStepFields";
import type { NicknameDialogStep } from "@/pages/collection-report/types";

export interface CollectionNicknameDialogProps {
  confirmNicknamePassword: string;
  dialogStep: NicknameDialogStep;
  nicknameDialogOpen: boolean;
  nicknameInput: string;
  nicknamePassword: string;
  onConfirmNicknamePasswordChange: (value: string) => void;
  onDialogOpenChange: (open: boolean) => void;
  onNicknameInputChange: (value: string) => void;
  onNicknamePasswordChange: (value: string) => void;
  onPrimaryAction: () => void;
  onReturnToSearch: () => void;
  onStepChange: (step: NicknameDialogStep) => void;
  onToggleLoginPassword: () => void;
  onToggleSetupConfirmPassword: () => void;
  onToggleSetupPassword: () => void;
  resolvedNickname: string;
  setSetupModeFirstTime: () => void;
  setupMode: "first-time" | "forced-change";
  showLoginPassword: boolean;
  showSetupConfirmPassword: boolean;
  showSetupPassword: boolean;
  submittingNicknameAuth: boolean;
  primaryLabel: string;
  primaryLoadingLabel: string;
  onResetTemporaryValues: () => void;
}

export function CollectionNicknameDialog({
  confirmNicknamePassword,
  dialogStep,
  nicknameDialogOpen,
  nicknameInput,
  nicknamePassword,
  onConfirmNicknamePasswordChange,
  onDialogOpenChange,
  onNicknameInputChange,
  onNicknamePasswordChange,
  onPrimaryAction,
  onResetTemporaryValues,
  onReturnToSearch,
  onStepChange,
  onToggleLoginPassword,
  onToggleSetupConfirmPassword,
  onToggleSetupPassword,
  primaryLabel,
  primaryLoadingLabel,
  resolvedNickname,
  setSetupModeFirstTime,
  setupMode,
  showLoginPassword,
  showSetupConfirmPassword,
  showSetupPassword,
  submittingNicknameAuth,
}: CollectionNicknameDialogProps) {
  const dialogTitle =
    dialogStep === "setup"
      ? setupMode === "forced-change"
        ? "Tetapkan Password Baharu"
        : "Simpan Password Nickname"
      : dialogStep === "login"
        ? "Login Nickname Collection"
        : "Masukkan Nama Staff Collection";
  const dialogDescription =
    dialogStep === "setup"
      ? setupMode === "forced-change"
        ? "Password sementara anda telah disahkan. Tetapkan kata laluan baharu untuk terus masuk ke Collection."
        : "Ini kali pertama untuk nickname ini. Tetapkan kata laluan baharu sebelum meneruskan."
      : dialogStep === "login"
        ? "Masukkan password nickname yang sah. Jika anda menggunakan password sementara, sistem akan minta anda tukar ke password baharu selepas ini."
        : "Sahkan nickname dahulu. Jika ini kali pertama atau password telah direset, anda akan dibimbing ke langkah set password.";

  return (
    <Dialog open={nicknameDialogOpen} onOpenChange={onDialogOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>{dialogDescription}</DialogDescription>
        </DialogHeader>

        <CollectionNicknameDialogStepFields
          confirmNicknamePassword={confirmNicknamePassword}
          dialogStep={dialogStep}
          nicknameInput={nicknameInput}
          nicknamePassword={nicknamePassword}
          onConfirmNicknamePasswordChange={onConfirmNicknamePasswordChange}
          onNicknameInputChange={onNicknameInputChange}
          onNicknamePasswordChange={onNicknamePasswordChange}
          onToggleLoginPassword={onToggleLoginPassword}
          onToggleSetupConfirmPassword={onToggleSetupConfirmPassword}
          onToggleSetupPassword={onToggleSetupPassword}
          resolvedNickname={resolvedNickname}
          setupMode={setupMode}
          showLoginPassword={showLoginPassword}
          showSetupConfirmPassword={showSetupConfirmPassword}
          showSetupPassword={showSetupPassword}
          submittingNicknameAuth={submittingNicknameAuth}
        />

        <DialogFooter className="gap-2">
          <CollectionNicknameDialogActions
            dialogStep={dialogStep}
            onPrimaryAction={onPrimaryAction}
            onResetTemporaryValues={onResetTemporaryValues}
            onReturnToSearch={onReturnToSearch}
            onStepChange={onStepChange}
            primaryLabel={primaryLabel}
            primaryLoadingLabel={primaryLoadingLabel}
            setSetupModeFirstTime={setSetupModeFirstTime}
            submittingNicknameAuth={submittingNicknameAuth}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

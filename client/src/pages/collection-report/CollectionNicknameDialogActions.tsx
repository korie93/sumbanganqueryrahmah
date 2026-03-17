import { Button } from "@/components/ui/button";
import type { NicknameDialogStep } from "@/pages/collection-report/types";

export interface CollectionNicknameDialogActionsProps {
  dialogStep: NicknameDialogStep;
  onPrimaryAction: () => void;
  onResetTemporaryValues: () => void;
  onReturnToSearch: () => void;
  onStepChange: (step: NicknameDialogStep) => void;
  primaryLabel: string;
  primaryLoadingLabel: string;
  setSetupModeFirstTime: () => void;
  submittingNicknameAuth: boolean;
}

export function CollectionNicknameDialogActions({
  dialogStep,
  onPrimaryAction,
  onResetTemporaryValues,
  onReturnToSearch,
  onStepChange,
  primaryLabel,
  primaryLoadingLabel,
  setSetupModeFirstTime,
  submittingNicknameAuth,
}: CollectionNicknameDialogActionsProps) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button variant="outline" onClick={onReturnToSearch} disabled={submittingNicknameAuth}>
        Close
      </Button>
      {dialogStep !== "nickname" ? (
        <Button
          variant="outline"
          onClick={() => {
            onStepChange("nickname");
            onResetTemporaryValues();
            setSetupModeFirstTime();
          }}
          disabled={submittingNicknameAuth}
        >
          Kembali
        </Button>
      ) : null}
      <Button onClick={onPrimaryAction} disabled={submittingNicknameAuth}>
        {submittingNicknameAuth ? primaryLoadingLabel : primaryLabel}
      </Button>
    </div>
  );
}

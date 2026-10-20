import { Button } from "@/components/ui/button";
import type { NicknameDialogStep } from "@/pages/collection-report/types";

export interface CollectionNicknameDialogActionsProps {
  dialogStep: NicknameDialogStep;
  onPrimaryAction: () => void;
  onResetTemporaryValues: () => void;
  onReturnToDashboard: () => void;
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
  onReturnToDashboard,
  onStepChange,
  primaryLabel,
  primaryLoadingLabel,
  setSetupModeFirstTime,
  submittingNicknameAuth,
}: CollectionNicknameDialogActionsProps) {
  return (
    <div className="flex w-full min-w-0 flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
      <Button type="button" variant="outline" onClick={onReturnToDashboard}>
        Kembali ke Dashboard
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

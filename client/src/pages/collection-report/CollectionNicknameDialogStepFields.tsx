import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CollectionNicknamePasswordField } from "@/pages/collection-report/CollectionNicknamePasswordField";
import type { NicknameDialogStep } from "@/pages/collection-report/types";

export interface CollectionNicknameDialogStepFieldsProps {
  confirmNicknamePassword: string;
  dialogStep: NicknameDialogStep;
  nicknameInput: string;
  nicknamePassword: string;
  onConfirmNicknamePasswordChange: (value: string) => void;
  onNicknameInputChange: (value: string) => void;
  onNicknamePasswordChange: (value: string) => void;
  onToggleLoginPassword: () => void;
  onToggleSetupConfirmPassword: () => void;
  onToggleSetupPassword: () => void;
  resolvedNickname: string;
  setupMode: "first-time" | "forced-change";
  showLoginPassword: boolean;
  showSetupConfirmPassword: boolean;
  showSetupPassword: boolean;
  submittingNicknameAuth: boolean;
}

export function CollectionNicknameDialogStepFields({
  confirmNicknamePassword,
  dialogStep,
  nicknameInput,
  nicknamePassword,
  onConfirmNicknamePasswordChange,
  onNicknameInputChange,
  onNicknamePasswordChange,
  onToggleLoginPassword,
  onToggleSetupConfirmPassword,
  onToggleSetupPassword,
  resolvedNickname,
  setupMode,
  showLoginPassword,
  showSetupConfirmPassword,
  showSetupPassword,
  submittingNicknameAuth,
}: CollectionNicknameDialogStepFieldsProps) {
  if (dialogStep === "nickname") {
    return (
      <div className="space-y-3">
        <div className="space-y-2">
          <Label>Staff Nickname</Label>
          <Input
            value={nicknameInput}
            onChange={(event) => onNicknameInputChange(event.target.value)}
            placeholder="Contoh: Sathia"
            disabled={submittingNicknameAuth}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Sistem akan semak nickname dahulu sebelum teruskan ke langkah set password atau login.
        </p>
      </div>
    );
  }

  if (dialogStep === "setup") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {setupMode === "forced-change"
            ? "Sila tetapkan kata laluan baharu sebelum meneruskan."
            : "Sila tetapkan kata laluan baharu untuk nickname ini sebelum meneruskan."}
        </p>
        <div className="space-y-2">
          <Label>Nickname</Label>
          <Input value={resolvedNickname} disabled />
        </div>
        <CollectionNicknamePasswordField
          disabled={submittingNicknameAuth}
          label="New Password"
          onChange={onNicknamePasswordChange}
          onToggleVisibility={onToggleSetupPassword}
          placeholder="Minimum 8 aksara"
          showPassword={showSetupPassword}
          value={nicknamePassword}
        />
        <CollectionNicknamePasswordField
          disabled={submittingNicknameAuth}
          label="Confirm Password"
          onChange={onConfirmNicknamePasswordChange}
          onToggleVisibility={onToggleSetupConfirmPassword}
          placeholder="Ulang password"
          showPassword={showSetupConfirmPassword}
          value={confirmNicknamePassword}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label>Nickname</Label>
        <Input value={resolvedNickname} disabled />
      </div>
      <CollectionNicknamePasswordField
        disabled={submittingNicknameAuth}
        label="Password"
        onChange={onNicknamePasswordChange}
        onToggleVisibility={onToggleLoginPassword}
        placeholder="Masukkan password nickname"
        showPassword={showLoginPassword}
        value={nicknamePassword}
      />
    </div>
  );
}

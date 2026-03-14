import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { NicknameDialogStep } from "@/pages/collection-report/types";

interface CollectionNicknameDialogProps {
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
  return (
    <Dialog open={nicknameDialogOpen} onOpenChange={onDialogOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Masukkan Nama Staff Collection</DialogTitle>
          <DialogDescription>
            Sahkan nickname dahulu. Jika ini kali pertama, anda perlu tetapkan password nickname baharu.
          </DialogDescription>
        </DialogHeader>

        {dialogStep === "nickname" ? (
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
        ) : null}

        {dialogStep === "setup" ? (
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
            <div className="space-y-2">
              <Label>New Password</Label>
              <div className="relative">
                <Input
                  type={showSetupPassword ? "text" : "password"}
                  value={nicknamePassword}
                  onChange={(event) => onNicknamePasswordChange(event.target.value)}
                  placeholder="Minimum 8 aksara"
                  className="pr-10"
                  disabled={submittingNicknameAuth}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 inline-flex items-center px-3 text-muted-foreground hover:text-foreground"
                  onClick={onToggleSetupPassword}
                  disabled={submittingNicknameAuth}
                  aria-label={showSetupPassword ? "Hide password" : "Show password"}
                >
                  {showSetupPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Confirm Password</Label>
              <div className="relative">
                <Input
                  type={showSetupConfirmPassword ? "text" : "password"}
                  value={confirmNicknamePassword}
                  onChange={(event) => onConfirmNicknamePasswordChange(event.target.value)}
                  placeholder="Ulang password"
                  className="pr-10"
                  disabled={submittingNicknameAuth}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 inline-flex items-center px-3 text-muted-foreground hover:text-foreground"
                  onClick={onToggleSetupConfirmPassword}
                  disabled={submittingNicknameAuth}
                  aria-label={showSetupConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showSetupConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {dialogStep === "login" ? (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>Nickname</Label>
              <Input value={resolvedNickname} disabled />
            </div>
            <div className="space-y-2">
              <Label>Password</Label>
              <div className="relative">
                <Input
                  type={showLoginPassword ? "text" : "password"}
                  value={nicknamePassword}
                  onChange={(event) => onNicknamePasswordChange(event.target.value)}
                  placeholder="Masukkan password nickname"
                  className="pr-10"
                  disabled={submittingNicknameAuth}
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 inline-flex items-center px-3 text-muted-foreground hover:text-foreground"
                  onClick={onToggleLoginPassword}
                  disabled={submittingNicknameAuth}
                  aria-label={showLoginPassword ? "Hide password" : "Show password"}
                >
                  {showLoginPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <DialogFooter className="gap-2">
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

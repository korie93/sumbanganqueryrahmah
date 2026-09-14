import { KeyRound } from "lucide-react";
import { PasswordConfirmationFeedback } from "@/components/PasswordConfirmationFeedback";
import { PasswordInput } from "@/components/PasswordInput";
import { PasswordStrengthMeter } from "@/components/PasswordStrengthMeter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";
import { TwoFactorSettingsPanel } from "@/pages/settings/TwoFactorSettingsPanel";
import { getAriaInvalidProps } from "@/lib/aria-state-props";

interface MyAccountSecurityCardProps {
  confirmPasswordInput: string;
  confirmPasswordError: string | null;
  currentPasswordInput: string;
  currentPasswordError: string | null;
  currentUserRole: string;
  newPasswordInput: string;
  newPasswordError: string | null;
  onDisableTwoFactor: () => void;
  onEnableTwoFactor: () => void;
  onChangePassword: () => void;
  onChangeUsername: () => void;
  onConfirmPasswordBlur: () => void;
  onConfirmPasswordInputChange: (value: string) => void;
  onCurrentPasswordBlur: () => void;
  onCurrentPasswordInputChange: (value: string) => void;
  onNewPasswordBlur: () => void;
  onNewPasswordInputChange: (value: string) => void;
  onStartTwoFactorSetup: () => void;
  onTwoFactorCodeBlur: () => void;
  onTwoFactorCodeInputChange: (value: string) => void;
  onTwoFactorPasswordBlur: () => void;
  onTwoFactorPasswordInputChange: (value: string) => void;
  onUsernameBlur: () => void;
  onUsernameInputChange: (value: string) => void;
  passwordSaving: boolean;
  twoFactorCodeError: string | null;
  twoFactorCodeInput: string;
  twoFactorEnabled: boolean;
  twoFactorLoading: boolean;
  twoFactorPasswordError: string | null;
  twoFactorPasswordInput: string;
  twoFactorPendingSetup: boolean;
  twoFactorSetupAccountName: string;
  twoFactorSetupIssuer: string;
  twoFactorSetupSecret: string;
  twoFactorSetupUri: string;
  twoFactorSetupExpiresAt?: string | null | undefined;
  twoFactorConfiguredAt?: string | null | undefined;
  twoFactorActionError?: string | null | undefined;
  onClearTwoFactorSetup?: (() => void) | undefined;
  usernameError: string | null;
  usernameInput: string;
  usernameSaving: boolean;
}

function getInvalidFieldProps(errorMessage: string | null, errorId: string) {
  return errorMessage
    ? {
      "aria-describedby": errorId,
      "aria-invalid": "true" as const,
    }
    : {};
}

export function MyAccountSecurityCard({
  confirmPasswordInput,
  confirmPasswordError,
  currentPasswordInput,
  currentPasswordError,
  currentUserRole,
  newPasswordInput,
  newPasswordError,
  onDisableTwoFactor,
  onEnableTwoFactor,
  onChangePassword,
  onChangeUsername,
  onConfirmPasswordBlur,
  onConfirmPasswordInputChange,
  onCurrentPasswordBlur,
  onCurrentPasswordInputChange,
  onNewPasswordBlur,
  onNewPasswordInputChange,
  onStartTwoFactorSetup,
  onTwoFactorCodeBlur,
  onTwoFactorCodeInputChange,
  onTwoFactorPasswordBlur,
  onTwoFactorPasswordInputChange,
  onUsernameBlur,
  onUsernameInputChange,
  passwordSaving,
  twoFactorCodeError,
  twoFactorCodeInput,
  twoFactorEnabled,
  twoFactorLoading,
  twoFactorPasswordError,
  twoFactorPasswordInput,
  twoFactorPendingSetup,
  twoFactorSetupAccountName,
  twoFactorSetupIssuer,
  twoFactorSetupSecret,
  twoFactorSetupUri,
  twoFactorSetupExpiresAt,
  twoFactorConfiguredAt,
  twoFactorActionError,
  onClearTwoFactorSetup,
  usernameError,
  usernameInput,
  usernameSaving,
}: MyAccountSecurityCardProps) {
  const isMobile = useIsMobile();
  const supportsTwoFactor = currentUserRole === "admin" || currentUserRole === "superuser";
  const securityBusy = usernameSaving || passwordSaving || twoFactorLoading;
  const twoFactorStatus = twoFactorEnabled
    ? "Diaktifkan"
    : twoFactorPendingSetup
      ? "Persediaan belum selesai"
      : "Belum diaktifkan";
  const twoFactorStatusVariant = twoFactorEnabled
    ? "default"
    : twoFactorPendingSetup
      ? "secondary"
      : "outline";
  const usernameErrorId = "my-account-username-error";
  const currentPasswordErrorId = "my-account-current-password-error";
  const newPasswordErrorId = "my-account-new-password-error";
  const confirmPasswordErrorId = "my-account-confirm-password-error";
  const usernameValidationProps = getInvalidFieldProps(usernameError, usernameErrorId);
  const currentPasswordValidationProps = getInvalidFieldProps(
    currentPasswordError,
    currentPasswordErrorId,
  );
  const newPasswordValidationProps = getInvalidFieldProps(newPasswordError, newPasswordErrorId);
  const confirmPasswordValidationProps = getAriaInvalidProps(
    Boolean(confirmPasswordInput ? newPasswordInput !== confirmPasswordInput : confirmPasswordError),
  );

  return (
    <Card className="border-border/60 bg-background/70">
      <CardHeader className={isMobile ? "space-y-4 pb-4" : ""}>
        <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
          <KeyRound className="h-5 w-5" />
          Keselamatan Akaun
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {isMobile
            ? "Kemas kini identiti akaun, kata laluan, dan perlindungan dua faktor."
            : "Urus nama pengguna, kata laluan, dan perlindungan dua faktor untuk akaun ini."}
        </p>
        {isMobile ? (
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              Peranan {currentUserRole}
            </Badge>
            {supportsTwoFactor ? (
              <Badge
                variant={twoFactorStatusVariant}
                className="rounded-full px-3 py-1"
              >
                2FA: {twoFactorStatus}
              </Badge>
            ) : null}
          </div>
        ) : null}
      </CardHeader>
      <CardContent className={isMobile ? "space-y-4 pt-0" : "space-y-6"}>
        <Card className="border-border/60 bg-background/60">
          <CardHeader className={isMobile ? "pb-4" : ""}>
            <CardTitle className="text-base">Akaun Saya</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 sm:space-y-6">
            <div className="space-y-4 rounded-2xl border border-border/60 bg-background/50 p-4 sm:rounded-xl sm:p-5">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">Identiti</h3>
                <p className="text-xs leading-5 text-muted-foreground">
                  Pastikan nama log masuk anda terkini tanpa meninggalkan halaman keselamatan.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                <div className="space-y-2">
                  <label htmlFor="my-account-username" className="text-sm font-medium">
                    Nama pengguna
                  </label>
                  <Input
                    id="my-account-username"
                    name="accountUsername"
                    value={usernameInput}
                    onChange={(event) => onUsernameInputChange(event.target.value)}
                    onBlur={onUsernameBlur}
                    disabled={securityBusy}
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    {...usernameValidationProps}
                  />
                  {usernameError ? (
                    <p id={usernameErrorId} className="text-xs text-destructive" role="alert">
                      {usernameError}
                    </p>
                  ) : null}
                </div>
                <Button
                  onClick={onChangeUsername}
                  disabled={securityBusy}
                  className="w-full md:w-auto"
                >
                  {usernameSaving ? "Mengemas kini..." : "Tukar nama pengguna"}
                </Button>
              </div>

              <div className="space-y-2">
                <label htmlFor="my-account-role" className="text-sm font-medium">
                  Peranan (baca sahaja)
                </label>
                <Input id="my-account-role" name="accountRole" value={currentUserRole} disabled />
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-border/60 bg-background/50 p-4 sm:rounded-xl sm:p-5">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">Tukar kata laluan</h3>
                <p className="text-xs leading-5 text-muted-foreground">
                  Masukkan kata laluan semasa sekali, kemudian tetapkan dan sahkan kata laluan baharu.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <label htmlFor="my-account-current-password" className="text-sm font-medium">
                    Kata laluan semasa
                  </label>
                  <PasswordInput
                    id="my-account-current-password"
                    name="currentPassword"
                    visibilityLabel="kata laluan semasa"
                    value={currentPasswordInput}
                    onChange={(event) => onCurrentPasswordInputChange(event.target.value)}
                    onBlur={onCurrentPasswordBlur}
                    disabled={securityBusy}
                    autoComplete="current-password"
                    {...currentPasswordValidationProps}
                  />
                  {currentPasswordError ? (
                    <p id={currentPasswordErrorId} className="text-xs text-destructive" role="alert">
                      {currentPasswordError}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <label htmlFor="my-account-new-password" className="text-sm font-medium">
                    Kata laluan baharu
                  </label>
                  <PasswordInput
                    id="my-account-new-password"
                    name="newPassword"
                    visibilityLabel="kata laluan baharu"
                    value={newPasswordInput}
                    onChange={(event) => onNewPasswordInputChange(event.target.value)}
                    onBlur={onNewPasswordBlur}
                    disabled={securityBusy}
                    autoComplete="new-password"
                    {...newPasswordValidationProps}
                    aria-describedby={["my-account-password-policy", newPasswordError ? newPasswordErrorId : null].filter(Boolean).join(" ")}
                  />
                  {newPasswordError ? (
                    <p id={newPasswordErrorId} className="text-xs text-destructive" role="alert">
                      {newPasswordError}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <label htmlFor="my-account-confirm-password" className="text-sm font-medium">
                    Sahkan kata laluan baharu
                  </label>
                  <PasswordInput
                    id="my-account-confirm-password"
                    name="confirmPassword"
                    visibilityLabel="pengesahan kata laluan baharu"
                    value={confirmPasswordInput}
                    onChange={(event) => onConfirmPasswordInputChange(event.target.value)}
                    onBlur={onConfirmPasswordBlur}
                    disabled={securityBusy}
                    autoComplete="new-password"
                    placeholder="Masukkan semula kata laluan baharu"
                    {...confirmPasswordValidationProps}
                    aria-describedby={confirmPasswordErrorId}
                  />
                  <PasswordConfirmationFeedback
                    id={confirmPasswordErrorId}
                    password={newPasswordInput}
                    confirmation={confirmPasswordInput}
                    requiredError={confirmPasswordError}
                  />
                </div>
              </div>
              <PasswordStrengthMeter id="my-account-password-policy" password={newPasswordInput} />
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end" data-floating-ai-avoid="true">
                <Button onClick={onChangePassword} disabled={securityBusy} className="w-full sm:w-auto">
                  {passwordSaving ? "Mengemas kini..." : "Tukar kata laluan"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        {supportsTwoFactor ? (
          <TwoFactorSettingsPanel
            busy={securityBusy}
            twoFactorEnabled={twoFactorEnabled}
            twoFactorPendingSetup={twoFactorPendingSetup}
            twoFactorLoading={twoFactorLoading}
            twoFactorPasswordInput={twoFactorPasswordInput}
            twoFactorPasswordError={twoFactorPasswordError}
            twoFactorCodeInput={twoFactorCodeInput}
            twoFactorCodeError={twoFactorCodeError}
            twoFactorSetupSecret={twoFactorSetupSecret}
            twoFactorSetupUri={twoFactorSetupUri}
            twoFactorSetupAccountName={twoFactorSetupAccountName}
            twoFactorSetupIssuer={twoFactorSetupIssuer}
            twoFactorSetupExpiresAt={twoFactorSetupExpiresAt}
            twoFactorConfiguredAt={twoFactorConfiguredAt}
            twoFactorActionError={twoFactorActionError}
            onClearTwoFactorSetup={onClearTwoFactorSetup}
            onStartTwoFactorSetup={onStartTwoFactorSetup}
            onEnableTwoFactor={onEnableTwoFactor}
            onDisableTwoFactor={onDisableTwoFactor}
            onTwoFactorPasswordInputChange={onTwoFactorPasswordInputChange}
            onTwoFactorPasswordBlur={onTwoFactorPasswordBlur}
            onTwoFactorCodeInputChange={onTwoFactorCodeInputChange}
            onTwoFactorCodeBlur={onTwoFactorCodeBlur}
          />
        ) : null}
      </CardContent>
    </Card>
  );
}

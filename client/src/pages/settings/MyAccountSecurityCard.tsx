import { KeyRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";

interface MyAccountSecurityCardProps {
  confirmPasswordInput: string;
  currentPasswordInput: string;
  currentUserRole: string;
  newPasswordInput: string;
  onDisableTwoFactor: () => void;
  onEnableTwoFactor: () => void;
  onChangePassword: () => void;
  onChangeUsername: () => void;
  onConfirmPasswordInputChange: (value: string) => void;
  onCurrentPasswordInputChange: (value: string) => void;
  onNewPasswordInputChange: (value: string) => void;
  onStartTwoFactorSetup: () => void;
  onTwoFactorCodeInputChange: (value: string) => void;
  onTwoFactorPasswordInputChange: (value: string) => void;
  onUsernameInputChange: (value: string) => void;
  passwordSaving: boolean;
  twoFactorCodeInput: string;
  twoFactorEnabled: boolean;
  twoFactorLoading: boolean;
  twoFactorPasswordInput: string;
  twoFactorPendingSetup: boolean;
  twoFactorSetupAccountName: string;
  twoFactorSetupIssuer: string;
  twoFactorSetupSecret: string;
  twoFactorSetupUri: string;
  usernameInput: string;
  usernameSaving: boolean;
}

export function MyAccountSecurityCard({
  confirmPasswordInput,
  currentPasswordInput,
  currentUserRole,
  newPasswordInput,
  onDisableTwoFactor,
  onEnableTwoFactor,
  onChangePassword,
  onChangeUsername,
  onConfirmPasswordInputChange,
  onCurrentPasswordInputChange,
  onNewPasswordInputChange,
  onStartTwoFactorSetup,
  onTwoFactorCodeInputChange,
  onTwoFactorPasswordInputChange,
  onUsernameInputChange,
  passwordSaving,
  twoFactorCodeInput,
  twoFactorEnabled,
  twoFactorLoading,
  twoFactorPasswordInput,
  twoFactorPendingSetup,
  twoFactorSetupAccountName,
  twoFactorSetupIssuer,
  twoFactorSetupSecret,
  twoFactorSetupUri,
  usernameInput,
  usernameSaving,
}: MyAccountSecurityCardProps) {
  const isMobile = useIsMobile();
  const supportsTwoFactor = currentUserRole === "admin" || currentUserRole === "superuser";
  const securityBusy = usernameSaving || passwordSaving || twoFactorLoading;
  const twoFactorStatus = twoFactorEnabled
    ? "Enabled"
    : twoFactorPendingSetup
      ? "Setup pending"
      : "Not enabled";
  const twoFactorStatusVariant = twoFactorEnabled
    ? "default"
    : twoFactorPendingSetup
      ? "secondary"
      : "outline";

  return (
    <Card className="border-border/60 bg-background/70">
      <CardHeader className={isMobile ? "space-y-4 pb-4" : undefined}>
        <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
          <KeyRound className="h-5 w-5" />
          Account Security
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {isMobile
            ? "Update your account identity, password, and two-factor protection."
            : "Manage your username, password, and two-factor protection for this account."}
        </p>
        {isMobile ? (
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              Role {currentUserRole}
            </Badge>
            {supportsTwoFactor ? (
              <Badge
                variant={twoFactorStatusVariant}
                className="rounded-full px-3 py-1"
              >
                2FA {twoFactorStatus}
              </Badge>
            ) : null}
          </div>
        ) : null}
      </CardHeader>
      <CardContent className={isMobile ? "pt-0" : undefined}>
        <Card className="border-border/60 bg-background/60">
          <CardHeader className={isMobile ? "pb-4" : undefined}>
            <CardTitle className="text-base">My Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 sm:space-y-6">
            <div className="space-y-4 rounded-2xl border border-border/60 bg-background/50 p-4 sm:rounded-xl sm:p-5">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">Identity</h3>
                <p className="text-xs leading-5 text-muted-foreground">
                  Keep your sign-in name current without leaving the security page.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Username</p>
                  <Input
                    value={usernameInput}
                    onChange={(event) => onUsernameInputChange(event.target.value)}
                    disabled={securityBusy}
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </div>
                <Button
                  onClick={onChangeUsername}
                  disabled={securityBusy}
                  className="w-full md:w-auto"
                >
                  {usernameSaving ? "Updating..." : "Change Username"}
                </Button>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Role (read only)</p>
                <Input value={currentUserRole} disabled />
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-border/60 bg-background/50 p-4 sm:rounded-xl sm:p-5">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">Change Password</h3>
                <p className="text-xs leading-5 text-muted-foreground">
                  Enter your current password once, then set and confirm the new password.
                </p>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Current Password</p>
                  <Input
                    type="password"
                    value={currentPasswordInput}
                    onChange={(event) => onCurrentPasswordInputChange(event.target.value)}
                    disabled={securityBusy}
                    autoComplete="current-password"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">New Password</p>
                  <Input
                    type="password"
                    value={newPasswordInput}
                    onChange={(event) => onNewPasswordInputChange(event.target.value)}
                    disabled={securityBusy}
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Confirm Password</p>
                  <Input
                    type="password"
                    value={confirmPasswordInput}
                    onChange={(event) => onConfirmPasswordInputChange(event.target.value)}
                    disabled={securityBusy}
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end" data-floating-ai-avoid="true">
                <Button onClick={onChangePassword} disabled={securityBusy} className="w-full sm:w-auto">
                  {passwordSaving ? "Updating..." : "Change Password"}
                </Button>
              </div>
            </div>

            {supportsTwoFactor ? (
              <div className="space-y-4 rounded-2xl border border-border/60 bg-background/50 p-4 sm:rounded-xl sm:p-5">
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Two-Factor Authentication</h3>
                  <div className="flex flex-wrap gap-2">
                    <Badge
                      variant={twoFactorStatusVariant}
                      className="rounded-full px-3 py-1"
                    >
                      {twoFactorStatus}
                    </Badge>
                    {twoFactorSetupSecret ? (
                      <Badge variant="outline" className="rounded-full px-3 py-1">
                        Setup secret ready
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">
                    Use your authenticator app to protect this account with a second verification step.
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Current Password</p>
                    <Input
                      type="password"
                      value={twoFactorPasswordInput}
                      onChange={(event) => onTwoFactorPasswordInputChange(event.target.value)}
                      disabled={securityBusy}
                      autoComplete="current-password"
                    />
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Authenticator Code</p>
                    <Input
                      inputMode="numeric"
                      placeholder="000000"
                      value={twoFactorCodeInput}
                      onChange={(event) => onTwoFactorCodeInputChange(event.target.value)}
                      disabled={securityBusy && !twoFactorPendingSetup}
                      pattern="[0-9]*"
                      autoComplete="one-time-code"
                    />
                  </div>
                </div>

                {twoFactorSetupSecret ? (
                  <div className="space-y-3 rounded-xl border border-border/60 bg-background/55 p-4">
                    <p className="text-sm text-muted-foreground">
                      Add this secret to your authenticator app, then enter the 6-digit code to enable 2FA.
                    </p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Issuer</p>
                        <Input value={twoFactorSetupIssuer} readOnly />
                      </div>
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Account Name</p>
                        <Input value={twoFactorSetupAccountName} readOnly />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Authenticator Secret</p>
                      <Input value={twoFactorSetupSecret} readOnly />
                    </div>
                    {twoFactorSetupUri ? (
                      <div className="space-y-2">
                        <p className="text-sm font-medium">OTP Auth URI</p>
                        <Input value={twoFactorSetupUri} readOnly />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap" data-floating-ai-avoid="true">
                  {!twoFactorEnabled ? (
                    <Button onClick={onStartTwoFactorSetup} disabled={securityBusy} className="w-full sm:w-auto">
                      {twoFactorLoading && !twoFactorSetupSecret ? "Preparing..." : "Start 2FA Setup"}
                    </Button>
                  ) : null}
                  {(twoFactorPendingSetup || twoFactorSetupSecret) && !twoFactorEnabled ? (
                    <Button onClick={onEnableTwoFactor} disabled={securityBusy} className="w-full sm:w-auto">
                      {twoFactorLoading ? "Verifying..." : "Verify & Enable 2FA"}
                    </Button>
                  ) : null}
                  {twoFactorEnabled ? (
                    <Button
                      variant="destructive"
                      onClick={onDisableTwoFactor}
                      disabled={securityBusy}
                      className="w-full sm:w-auto"
                    >
                      {twoFactorLoading ? "Disabling..." : "Disable 2FA"}
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </CardContent>
    </Card>
  );
}

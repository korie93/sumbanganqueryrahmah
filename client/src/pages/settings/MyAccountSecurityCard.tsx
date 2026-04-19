import { KeyRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";

export interface MyAccountSecurityIdentityFields {
  currentUserRole: string;
  onChangeUsername: () => void;
  onUsernameInputChange: (value: string) => void;
  usernameInput: string;
  usernameSaving: boolean;
}

export interface MyAccountSecurityPasswordFields {
  confirmPasswordInput: string;
  currentPasswordInput: string;
  newPasswordInput: string;
  onChangePassword: () => void;
  onConfirmPasswordInputChange: (value: string) => void;
  onCurrentPasswordInputChange: (value: string) => void;
  onNewPasswordInputChange: (value: string) => void;
  passwordSaving: boolean;
}

export interface MyAccountSecurityTwoFactorFields {
  onDisableTwoFactor: () => void;
  onEnableTwoFactor: () => void;
  onStartTwoFactorSetup: () => void;
  onTwoFactorCodeInputChange: (value: string) => void;
  onTwoFactorPasswordInputChange: (value: string) => void;
  twoFactorCodeInput: string;
  twoFactorEnabled: boolean;
  twoFactorLoading: boolean;
  twoFactorPasswordInput: string;
  twoFactorPendingSetup: boolean;
  twoFactorSetupAccountName: string;
  twoFactorSetupIssuer: string;
  twoFactorSetupSecret: string;
  twoFactorSetupUri: string;
}

export interface MyAccountSecurityCardProps {
  identity: MyAccountSecurityIdentityFields;
  password: MyAccountSecurityPasswordFields;
  twoFactor: MyAccountSecurityTwoFactorFields;
}

export function MyAccountSecurityCard({
  identity,
  password,
  twoFactor,
}: MyAccountSecurityCardProps) {
  const isMobile = useIsMobile();
  const supportsTwoFactor =
    identity.currentUserRole === "admin" || identity.currentUserRole === "superuser";
  const securityBusy =
    identity.usernameSaving || password.passwordSaving || twoFactor.twoFactorLoading;
  const twoFactorStatus = twoFactor.twoFactorEnabled
    ? "Enabled"
    : twoFactor.twoFactorPendingSetup
      ? "Setup pending"
      : "Not enabled";
  const twoFactorStatusVariant = twoFactor.twoFactorEnabled
    ? "default"
    : twoFactor.twoFactorPendingSetup
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
              Role {identity.currentUserRole}
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
                  <label htmlFor="my-account-username" className="text-sm font-medium">
                    Username
                  </label>
                  <Input
                    id="my-account-username"
                    name="accountUsername"
                    value={identity.usernameInput}
                    onChange={(event) => identity.onUsernameInputChange(event.target.value)}
                    disabled={securityBusy}
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </div>
                <Button
                  onClick={identity.onChangeUsername}
                  disabled={securityBusy}
                  className="w-full md:w-auto"
                >
                  {identity.usernameSaving ? "Updating..." : "Change Username"}
                </Button>
              </div>

              <div className="space-y-2">
                <label htmlFor="my-account-role" className="text-sm font-medium">
                  Role (read only)
                </label>
                <Input id="my-account-role" name="accountRole" value={identity.currentUserRole} disabled />
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
                  <label htmlFor="my-account-current-password" className="text-sm font-medium">
                    Current Password
                  </label>
                  <Input
                    id="my-account-current-password"
                    name="currentPassword"
                    type="password"
                    value={password.currentPasswordInput}
                    onChange={(event) => password.onCurrentPasswordInputChange(event.target.value)}
                    disabled={securityBusy}
                    autoComplete="current-password"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="my-account-new-password" className="text-sm font-medium">
                    New Password
                  </label>
                  <Input
                    id="my-account-new-password"
                    name="newPassword"
                    type="password"
                    value={password.newPasswordInput}
                    onChange={(event) => password.onNewPasswordInputChange(event.target.value)}
                    disabled={securityBusy}
                    autoComplete="new-password"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="my-account-confirm-password" className="text-sm font-medium">
                    Confirm Password
                  </label>
                  <Input
                    id="my-account-confirm-password"
                    name="confirmPassword"
                    type="password"
                    value={password.confirmPasswordInput}
                    onChange={(event) => password.onConfirmPasswordInputChange(event.target.value)}
                    disabled={securityBusy}
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end" data-floating-ai-avoid="true">
                <Button onClick={password.onChangePassword} disabled={securityBusy} className="w-full sm:w-auto">
                  {password.passwordSaving ? "Updating..." : "Change Password"}
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
                    {twoFactor.twoFactorSetupSecret ? (
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
                    <label htmlFor="my-account-two-factor-password" className="text-sm font-medium">
                      Current Password
                    </label>
                    <Input
                      id="my-account-two-factor-password"
                      name="twoFactorCurrentPassword"
                      type="password"
                      value={twoFactor.twoFactorPasswordInput}
                      onChange={(event) => twoFactor.onTwoFactorPasswordInputChange(event.target.value)}
                      disabled={securityBusy}
                      autoComplete="current-password"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="my-account-two-factor-code" className="text-sm font-medium">
                      Authenticator Code
                    </label>
                    <Input
                      id="my-account-two-factor-code"
                      name="twoFactorAuthenticatorCode"
                      inputMode="numeric"
                      placeholder="000000"
                      value={twoFactor.twoFactorCodeInput}
                      onChange={(event) => twoFactor.onTwoFactorCodeInputChange(event.target.value)}
                      disabled={securityBusy && !twoFactor.twoFactorPendingSetup}
                      pattern="[0-9]*"
                      autoComplete="one-time-code"
                    />
                  </div>
                </div>

                {twoFactor.twoFactorSetupSecret ? (
                  <div className="space-y-3 rounded-xl border border-border/60 bg-background/55 p-4">
                    <p className="text-sm text-muted-foreground">
                      Add this secret to your authenticator app, then enter the 6-digit code to enable 2FA.
                    </p>
                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="space-y-2">
                        <label htmlFor="my-account-two-factor-issuer" className="text-sm font-medium">
                          Issuer
                        </label>
                        <Input
                          id="my-account-two-factor-issuer"
                          name="twoFactorSetupIssuer"
                          value={twoFactor.twoFactorSetupIssuer}
                          readOnly
                        />
                      </div>
                      <div className="space-y-2">
                        <label htmlFor="my-account-two-factor-account-name" className="text-sm font-medium">
                          Account Name
                        </label>
                        <Input
                          id="my-account-two-factor-account-name"
                          name="twoFactorSetupAccountName"
                          value={twoFactor.twoFactorSetupAccountName}
                          readOnly
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label htmlFor="my-account-two-factor-secret" className="text-sm font-medium">
                        Authenticator Secret
                      </label>
                      <Input
                        id="my-account-two-factor-secret"
                        name="twoFactorSetupSecret"
                        value={twoFactor.twoFactorSetupSecret}
                        readOnly
                      />
                    </div>
                    {twoFactor.twoFactorSetupUri ? (
                      <div className="space-y-2">
                        <label htmlFor="my-account-two-factor-uri" className="text-sm font-medium">
                          OTP Auth URI
                        </label>
                        <Input
                          id="my-account-two-factor-uri"
                          name="twoFactorSetupUri"
                          value={twoFactor.twoFactorSetupUri}
                          readOnly
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap" data-floating-ai-avoid="true">
                  {!twoFactor.twoFactorEnabled ? (
                    <Button onClick={twoFactor.onStartTwoFactorSetup} disabled={securityBusy} className="w-full sm:w-auto">
                      {twoFactor.twoFactorLoading && !twoFactor.twoFactorSetupSecret ? "Preparing..." : "Start 2FA Setup"}
                    </Button>
                  ) : null}
                  {(twoFactor.twoFactorPendingSetup || twoFactor.twoFactorSetupSecret) && !twoFactor.twoFactorEnabled ? (
                    <Button onClick={twoFactor.onEnableTwoFactor} disabled={securityBusy} className="w-full sm:w-auto">
                      {twoFactor.twoFactorLoading ? "Verifying..." : "Verify & Enable 2FA"}
                    </Button>
                  ) : null}
                  {twoFactor.twoFactorEnabled ? (
                    <Button
                      variant="destructive"
                      onClick={twoFactor.onDisableTwoFactor}
                      disabled={securityBusy}
                      className="w-full sm:w-auto"
                    >
                      {twoFactor.twoFactorLoading ? "Disabling..." : "Disable 2FA"}
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

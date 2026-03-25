import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

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
  const supportsTwoFactor = currentUserRole === "admin" || currentUserRole === "superuser";
  const securityBusy = usernameSaving || passwordSaving || twoFactorLoading;

  return (
    <Card className="border-border/60 bg-background/70">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <KeyRound className="h-5 w-5" />
          Account Security
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Card className="border-border/60 bg-background/60">
          <CardHeader>
            <CardTitle className="text-base">My Account</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
              <div className="space-y-2">
                <p className="text-sm font-medium">Username</p>
                <Input
                  value={usernameInput}
                  onChange={(event) => onUsernameInputChange(event.target.value)}
                  disabled={securityBusy}
                />
              </div>
              <Button onClick={onChangeUsername} disabled={securityBusy}>
                {usernameSaving ? "Updating..." : "Change Username"}
              </Button>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Role (read only)</p>
              <Input value={currentUserRole} disabled />
            </div>

            <div className="space-y-4 border-t border-border/60 pt-6">
              <h3 className="text-sm font-semibold">Change Password</h3>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Current Password</p>
                  <Input
                    type="password"
                    value={currentPasswordInput}
                    onChange={(event) => onCurrentPasswordInputChange(event.target.value)}
                    disabled={securityBusy}
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">New Password</p>
                  <Input
                    type="password"
                    value={newPasswordInput}
                    onChange={(event) => onNewPasswordInputChange(event.target.value)}
                    disabled={securityBusy}
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Confirm Password</p>
                  <Input
                    type="password"
                    value={confirmPasswordInput}
                    onChange={(event) => onConfirmPasswordInputChange(event.target.value)}
                    disabled={securityBusy}
                  />
                </div>
              </div>
              <Button onClick={onChangePassword} disabled={securityBusy}>
                {passwordSaving ? "Updating..." : "Change Password"}
              </Button>
            </div>

            {supportsTwoFactor ? (
              <div className="space-y-4 border-t border-border/60 pt-6">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold">Two-Factor Authentication</h3>
                  <p className="text-sm text-muted-foreground">
                    Status: {twoFactorEnabled ? "Enabled" : twoFactorPendingSetup ? "Setup pending" : "Not enabled"}
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
                    />
                  </div>
                </div>

                {twoFactorSetupSecret ? (
                  <div className="space-y-3 rounded-lg border border-border/60 bg-background/50 p-4">
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

                <div className="flex flex-wrap gap-3">
                  {!twoFactorEnabled ? (
                    <Button onClick={onStartTwoFactorSetup} disabled={securityBusy}>
                      {twoFactorLoading && !twoFactorSetupSecret ? "Preparing..." : "Start 2FA Setup"}
                    </Button>
                  ) : null}
                  {(twoFactorPendingSetup || twoFactorSetupSecret) && !twoFactorEnabled ? (
                    <Button onClick={onEnableTwoFactor} disabled={securityBusy}>
                      {twoFactorLoading ? "Verifying..." : "Verify & Enable 2FA"}
                    </Button>
                  ) : null}
                  {twoFactorEnabled ? (
                    <Button variant="destructive" onClick={onDisableTwoFactor} disabled={securityBusy}>
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

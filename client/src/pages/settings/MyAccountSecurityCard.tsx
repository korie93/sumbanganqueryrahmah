import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface MyAccountSecurityCardProps {
  confirmPasswordInput: string;
  currentPasswordInput: string;
  currentUserRole: string;
  newPasswordInput: string;
  onChangePassword: () => void;
  onChangeUsername: () => void;
  onConfirmPasswordInputChange: (value: string) => void;
  onCurrentPasswordInputChange: (value: string) => void;
  onNewPasswordInputChange: (value: string) => void;
  onUsernameInputChange: (value: string) => void;
  passwordSaving: boolean;
  usernameInput: string;
  usernameSaving: boolean;
}

export function MyAccountSecurityCard({
  confirmPasswordInput,
  currentPasswordInput,
  currentUserRole,
  newPasswordInput,
  onChangePassword,
  onChangeUsername,
  onConfirmPasswordInputChange,
  onCurrentPasswordInputChange,
  onNewPasswordInputChange,
  onUsernameInputChange,
  passwordSaving,
  usernameInput,
  usernameSaving,
}: MyAccountSecurityCardProps) {
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
                  disabled={usernameSaving || passwordSaving}
                />
              </div>
              <Button onClick={onChangeUsername} disabled={usernameSaving || passwordSaving}>
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
                    disabled={passwordSaving || usernameSaving}
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">New Password</p>
                  <Input
                    type="password"
                    value={newPasswordInput}
                    onChange={(event) => onNewPasswordInputChange(event.target.value)}
                    disabled={passwordSaving || usernameSaving}
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Confirm Password</p>
                  <Input
                    type="password"
                    value={confirmPasswordInput}
                    onChange={(event) => onConfirmPasswordInputChange(event.target.value)}
                    disabled={passwordSaving || usernameSaving}
                  />
                </div>
              </div>
              <Button onClick={onChangePassword} disabled={passwordSaving || usernameSaving}>
                {passwordSaving ? "Updating..." : "Change Password"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </CardContent>
    </Card>
  );
}

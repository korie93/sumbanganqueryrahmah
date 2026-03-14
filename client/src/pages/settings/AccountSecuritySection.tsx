import { KeyRound, UserCog } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { ManagedUser } from "@/pages/settings/types";

interface AccountSecuritySectionProps {
  confirmPasswordInput: string;
  currentPasswordInput: string;
  currentUserRole: string;
  isSuperuser: boolean;
  managedUsers: ManagedUser[];
  managedUsersLoading: boolean;
  newPasswordInput: string;
  onChangePassword: () => void;
  onChangeUsername: () => void;
  onConfirmPasswordInputChange: (value: string) => void;
  onCurrentPasswordInputChange: (value: string) => void;
  onEditManagedUser: (user: ManagedUser) => void;
  onNewPasswordInputChange: (value: string) => void;
  onUsernameInputChange: (value: string) => void;
  passwordSaving: boolean;
  usernameInput: string;
  usernameSaving: boolean;
}

export function AccountSecuritySection({
  confirmPasswordInput,
  currentPasswordInput,
  currentUserRole,
  isSuperuser,
  managedUsers,
  managedUsersLoading,
  newPasswordInput,
  onChangePassword,
  onChangeUsername,
  onConfirmPasswordInputChange,
  onCurrentPasswordInputChange,
  onEditManagedUser,
  onNewPasswordInputChange,
  onUsernameInputChange,
  passwordSaving,
  usernameInput,
  usernameSaving,
}: AccountSecuritySectionProps) {
  return (
    <div className="space-y-6">
      <Card className="border-border/60 bg-background/70">
        <CardHeader>
          <CardTitle className="text-xl flex items-center gap-2">
            <KeyRound className="w-5 h-5" />
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

              <div className="border-t border-border/60 pt-6 space-y-4">
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

      {isSuperuser ? (
        <Card className="border-border/60 bg-background/70">
          <CardHeader>
            <CardTitle className="text-xl flex items-center gap-2">
              <UserCog className="w-5 h-5" />
              User Credential Management
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {managedUsersLoading ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      Loading users...
                    </TableCell>
                  </TableRow>
                ) : managedUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground">
                      No admin/user accounts found.
                    </TableCell>
                  </TableRow>
                ) : (
                  managedUsers.map((user) => (
                    <TableRow key={user.id}>
                      <TableCell>{user.username}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{user.role}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" onClick={() => onEditManagedUser(user)}>
                          Edit credentials
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

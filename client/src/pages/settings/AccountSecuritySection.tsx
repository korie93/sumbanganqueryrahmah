import { KeyRound, LifeBuoy, ShieldCheck, UserCog } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DevMailOutboxCard } from "@/pages/settings/DevMailOutboxCard";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type {
  DevMailOutboxPreview,
  ManagedUser,
  PendingPasswordResetRequest,
} from "@/pages/settings/types";

interface AccountSecuritySectionProps {
  confirmPasswordInput: string;
  createEmailInput: string;
  createFullNameInput: string;
  createRoleInput: "admin" | "user";
  createUsernameInput: string;
  creatingManagedUser: boolean;
  currentPasswordInput: string;
  currentUserRole: string;
  devMailOutboxEnabled: boolean;
  devMailOutboxEntries: DevMailOutboxPreview[];
  devMailOutboxLoading: boolean;
  isSuperuser: boolean;
  managedUsers: ManagedUser[];
  managedUsersLoading: boolean;
  newPasswordInput: string;
  onChangePassword: () => void;
  onChangeUsername: () => void;
  onConfirmPasswordInputChange: (value: string) => void;
  onCreateEmailInputChange: (value: string) => void;
  onCreateFullNameInputChange: (value: string) => void;
  onCreateManagedUser: () => void;
  onCreateRoleInputChange: (value: "admin" | "user") => void;
  onCreateUsernameInputChange: (value: string) => void;
  onCurrentPasswordInputChange: (value: string) => void;
  onDevMailOutboxRefresh: () => void;
  onEditManagedUser: (user: ManagedUser) => void;
  onManagedBanToggle: (user: ManagedUser) => void;
  onManagedResetPassword: (user: ManagedUser) => void;
  onManagedResendActivation: (user: ManagedUser) => void;
  onNewPasswordInputChange: (value: string) => void;
  onUsernameInputChange: (value: string) => void;
  passwordSaving: boolean;
  pendingResetRequests: PendingPasswordResetRequest[];
  pendingResetRequestsLoading: boolean;
  usernameInput: string;
  usernameSaving: boolean;
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function getStatusVariant(status: string, isBanned: boolean | null) {
  if (isBanned) return "destructive";
  if (status === "active") return "default";
  return "secondary";
}

export function AccountSecuritySection({
  confirmPasswordInput,
  createEmailInput,
  createFullNameInput,
  createRoleInput,
  createUsernameInput,
  creatingManagedUser,
  currentPasswordInput,
  currentUserRole,
  devMailOutboxEnabled,
  devMailOutboxEntries,
  devMailOutboxLoading,
  isSuperuser,
  managedUsers,
  managedUsersLoading,
  newPasswordInput,
  onChangePassword,
  onChangeUsername,
  onConfirmPasswordInputChange,
  onCreateEmailInputChange,
  onCreateFullNameInputChange,
  onCreateManagedUser,
  onCreateRoleInputChange,
  onCreateUsernameInputChange,
  onCurrentPasswordInputChange,
  onDevMailOutboxRefresh,
  onEditManagedUser,
  onManagedBanToggle,
  onManagedResetPassword,
  onManagedResendActivation,
  onNewPasswordInputChange,
  onUsernameInputChange,
  passwordSaving,
  pendingResetRequests,
  pendingResetRequestsLoading,
  usernameInput,
  usernameSaving,
}: AccountSecuritySectionProps) {
  return (
    <div className="space-y-6">
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

      {isSuperuser ? (
        <>
          <Card className="border-border/60 bg-background/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <ShieldCheck className="h-5 w-5" />
                Create Closed Account
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 lg:grid-cols-4">
              <Input
                value={createFullNameInput}
                onChange={(event) => onCreateFullNameInputChange(event.target.value)}
                placeholder="Full name"
                disabled={creatingManagedUser}
              />
              <Input
                value={createUsernameInput}
                onChange={(event) => onCreateUsernameInputChange(event.target.value)}
                placeholder="Username"
                disabled={creatingManagedUser}
              />
              <Input
                value={createEmailInput}
                onChange={(event) => onCreateEmailInputChange(event.target.value)}
                placeholder="Email"
                disabled={creatingManagedUser}
              />
              <div className="flex gap-3">
                <select
                  value={createRoleInput}
                  onChange={(event) =>
                    onCreateRoleInputChange(event.target.value === "admin" ? "admin" : "user")
                  }
                  className="h-10 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                  disabled={creatingManagedUser}
                >
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
                <Button onClick={onCreateManagedUser} disabled={creatingManagedUser}>
                  {creatingManagedUser ? "Creating..." : "Create"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <DevMailOutboxCard
            enabled={devMailOutboxEnabled}
            entries={devMailOutboxEntries}
            loading={devMailOutboxLoading}
            onRefresh={onDevMailOutboxRefresh}
          />

          <Card className="border-border/60 bg-background/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <UserCog className="h-5 w-5" />
                Managed Accounts
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Last Login</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {managedUsersLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        Loading users...
                      </TableCell>
                    </TableRow>
                  ) : managedUsers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        No managed accounts found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    managedUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium">{user.username}</div>
                            <div className="text-xs text-muted-foreground">
                              {user.fullName || user.email || "No profile details"}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{user.role}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant={getStatusVariant(user.status, user.isBanned)}>
                              {user.isBanned ? "banned" : user.status}
                            </Badge>
                            {user.mustChangePassword ? (
                              <Badge variant="outline">must change password</Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>{formatDateTime(user.lastLoginAt)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-wrap justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => onEditManagedUser(user)}>
                              Edit
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => onManagedResetPassword(user)}>
                              Send Reset Email
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => onManagedResendActivation(user)}
                              disabled={user.status !== "pending_activation" || Boolean(user.isBanned)}
                            >
                              Resend Activation
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => onManagedBanToggle(user)}>
                              {user.isBanned ? "Unban" : "Ban"}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-background/70">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <LifeBuoy className="h-5 w-5" />
                Pending Password Reset Requests
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Requested By</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingResetRequestsLoading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        Loading reset requests...
                      </TableCell>
                    </TableRow>
                  ) : pendingResetRequests.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground">
                        No pending reset requests.
                      </TableCell>
                    </TableRow>
                  ) : (
                    pendingResetRequests.map((request) => (
                      <TableRow key={request.id}>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="font-medium">{request.username}</div>
                            <div className="text-xs text-muted-foreground">
                              {request.fullName || request.email || "No profile details"}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{request.requestedByUser || "-"}</TableCell>
                        <TableCell>
                          <Badge variant={getStatusVariant(request.status, request.isBanned)}>
                            {request.isBanned ? "banned" : request.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDateTime(request.createdAt)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface CreateClosedAccountSectionProps {
  createEmailInput: string;
  createFullNameInput: string;
  createRoleInput: "admin" | "user";
  createUsernameInput: string;
  creatingManagedUser: boolean;
  onCreateEmailInputChange: (value: string) => void;
  onCreateFullNameInputChange: (value: string) => void;
  onCreateManagedUser: () => void;
  onCreateRoleInputChange: (value: "admin" | "user") => void;
  onCreateUsernameInputChange: (value: string) => void;
}

export function CreateClosedAccountSection({
  createEmailInput,
  createFullNameInput,
  createRoleInput,
  createUsernameInput,
  creatingManagedUser,
  onCreateEmailInputChange,
  onCreateFullNameInputChange,
  onCreateManagedUser,
  onCreateRoleInputChange,
  onCreateUsernameInputChange,
}: CreateClosedAccountSectionProps) {
  return (
    <Card className="border-border/60 bg-background/60">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <ShieldCheck className="h-5 w-5" />
          Create Closed Account
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Superuser-only onboarding for accounts that must complete activation through email before
          first login.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-2">
            <p className="text-sm font-medium">Full name</p>
            <Input
              value={createFullNameInput}
              onChange={(event) => onCreateFullNameInputChange(event.target.value)}
              placeholder="Full name"
              disabled={creatingManagedUser}
            />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Username</p>
            <Input
              value={createUsernameInput}
              onChange={(event) => onCreateUsernameInputChange(event.target.value)}
              placeholder="Username"
              disabled={creatingManagedUser}
            />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Email</p>
            <Input
              value={createEmailInput}
              onChange={(event) => onCreateEmailInputChange(event.target.value)}
              placeholder="Email"
              disabled={creatingManagedUser}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="create-closed-account-role" className="text-sm font-medium">
              Role
            </label>
            <select
              id="create-closed-account-role"
              value={createRoleInput}
              onChange={(event) =>
                onCreateRoleInputChange(event.target.value === "admin" ? "admin" : "user")
              }
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              disabled={creatingManagedUser}
            >
              <option value="user">user</option>
              <option value="admin">admin</option>
            </select>
          </div>
        </div>

        <div className="flex justify-end" data-floating-ai-avoid="true">
          <Button onClick={onCreateManagedUser} disabled={creatingManagedUser}>
            {creatingManagedUser ? "Creating..." : "Create Closed Account"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

import { AlertTriangle, CheckCircle2, Info, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useMobileKeyboardState } from "@/hooks/use-mobile-keyboard-state";
import { cn } from "@/lib/utils";
import {
  buildManagedUserCreateReadiness,
  getManagedUserCreateRoleGuidance,
  type ManagedUserCreateFieldErrors,
} from "@/pages/settings/settings-managed-user-create-utils";
import type { ManagedUserCreateRole } from "@/pages/settings/settings-managed-user-create-shared";

interface CreateClosedAccountSectionProps {
  createEmailInput: string;
  createFieldErrors: ManagedUserCreateFieldErrors;
  createFullNameInput: string;
  createRoleInput: ManagedUserCreateRole;
  createUsernameInput: string;
  creatingManagedUser: boolean;
  onCreateEmailInputChange: (value: string) => void;
  onCreateFieldBlur: (field: keyof ManagedUserCreateFieldErrors) => void;
  onCreateFullNameInputChange: (value: string) => void;
  onCreateManagedUser: () => void;
  onCreateRoleInputChange: (value: ManagedUserCreateRole) => void;
  onCreateUsernameInputChange: (value: string) => void;
}

export function CreateClosedAccountSection({
  createEmailInput,
  createFieldErrors,
  createFullNameInput,
  createRoleInput,
  createUsernameInput,
  creatingManagedUser,
  onCreateEmailInputChange,
  onCreateFieldBlur,
  onCreateFullNameInputChange,
  onCreateManagedUser,
  onCreateRoleInputChange,
  onCreateUsernameInputChange,
}: CreateClosedAccountSectionProps) {
  const keyboardOpen = useMobileKeyboardState();
  const usernameErrorId = "create-closed-account-username-error";
  const usernameHelpId = "create-closed-account-username-help";
  const emailErrorId = "create-closed-account-email-error";
  const emailHelpId = "create-closed-account-email-help";
  const roleDescriptionId = "create-closed-account-role-description";
  const roleGuidance = getManagedUserCreateRoleGuidance(createRoleInput);
  const readinessItems = buildManagedUserCreateReadiness({
    createEmailInput,
    createFullNameInput,
    createRoleInput,
    createUsernameInput,
  });
  const usernameDescription = createFieldErrors.createUsernameInput
    ? `${usernameHelpId} ${usernameErrorId}`
    : usernameHelpId;
  const emailDescription = createFieldErrors.createEmailInput
    ? `${emailHelpId} ${emailErrorId}`
    : emailHelpId;
  const RoleGuidanceIcon = roleGuidance.tone === "warning" ? AlertTriangle : Info;

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
            <label htmlFor="create-closed-account-full-name" className="text-sm font-medium">
              Full name
            </label>
            <Input
              id="create-closed-account-full-name"
              name="closedAccountFullName"
              value={createFullNameInput}
              onChange={(event) => onCreateFullNameInputChange(event.target.value)}
              placeholder="Full name"
              disabled={creatingManagedUser}
              autoComplete="name"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="create-closed-account-username" className="text-sm font-medium">
              Username
            </label>
            <Input
              id="create-closed-account-username"
              name="closedAccountUsername"
              value={createUsernameInput}
              onChange={(event) => onCreateUsernameInputChange(event.target.value)}
              onBlur={() => onCreateFieldBlur("createUsernameInput")}
              placeholder="Username"
              disabled={creatingManagedUser}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={createFieldErrors.createUsernameInput ? true : undefined}
              aria-describedby={usernameDescription}
            />
            <p id={usernameHelpId} className="text-xs text-muted-foreground">
              3-32 characters: letters, numbers, dot, underscore, or hyphen.
            </p>
            {createFieldErrors.createUsernameInput ? (
              <p id={usernameErrorId} className="text-xs text-destructive" role="alert">
                {createFieldErrors.createUsernameInput}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <label htmlFor="create-closed-account-email" className="text-sm font-medium">
              Email
            </label>
            <Input
              id="create-closed-account-email"
              name="closedAccountEmail"
              type="email"
              value={createEmailInput}
              onChange={(event) => onCreateEmailInputChange(event.target.value)}
              onBlur={() => onCreateFieldBlur("createEmailInput")}
              placeholder="Email"
              disabled={creatingManagedUser}
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={createFieldErrors.createEmailInput ? true : undefined}
              aria-describedby={emailDescription}
            />
            <p id={emailHelpId} className="text-xs text-muted-foreground">
              Activation email is required before first login.
            </p>
            {createFieldErrors.createEmailInput ? (
              <p id={emailErrorId} className="text-xs text-destructive" role="alert">
                {createFieldErrors.createEmailInput}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <label htmlFor="create-closed-account-role" className="text-sm font-medium">
              Role
            </label>
            <select
              id="create-closed-account-role"
              name="closedAccountRole"
              value={createRoleInput}
              onChange={(event) => {
                const nextRole = event.target.value;
                onCreateRoleInputChange(
                  nextRole === "admin" || nextRole === "manager" ? nextRole : "user",
                );
              }}
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              disabled={creatingManagedUser}
              aria-describedby={roleDescriptionId}
            >
              <option value="user">user</option>
              <option value="manager">manager</option>
              <option value="admin">admin</option>
            </select>
          </div>
        </div>

        <div
          id={roleDescriptionId}
          className={cn(
            "flex gap-3 rounded-lg border border-border/60 bg-muted/20 p-3 text-sm",
            roleGuidance.tone === "warning" && "border-amber-600/40 bg-amber-500/10",
          )}
        >
          <RoleGuidanceIcon
            className={cn(
              "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground",
              roleGuidance.tone === "warning" && "text-foreground",
            )}
            aria-hidden="true"
          />
          <div className="min-w-0 space-y-1">
            <p className="font-medium text-foreground">{roleGuidance.label}</p>
            <p className="text-muted-foreground">{roleGuidance.description}</p>
          </div>
        </div>

        <div
          className="grid gap-2 rounded-lg border border-dashed border-border/70 bg-background/40 p-3 text-sm sm:grid-cols-3"
          aria-label="Create account readiness"
        >
          {readinessItems.map((item) => (
            <div key={item.id} className="flex min-w-0 items-center gap-2">
              <CheckCircle2
                className={cn(
                  "h-4 w-4 shrink-0",
                  item.ready ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground",
                )}
                aria-hidden="true"
              />
              <span className="truncate text-foreground">
                {item.label}: {item.ready ? "Ready" : "Needed"}
              </span>
            </div>
          ))}
        </div>

        <div
          className={cn(
            "-mx-6 flex flex-col gap-2 border-t border-border/60 bg-background/95 px-6 pb-[calc(var(--safe-area-inset-bottom)+0.75rem)] pt-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/85 sm:static sm:mx-0 sm:flex-row sm:justify-end sm:border-0 sm:bg-transparent sm:px-0 sm:pt-0 sm:shadow-none sm:backdrop-blur-0",
            keyboardOpen ? "static" : "sticky bottom-0 z-[var(--z-sticky-content)]",
          )}
          data-floating-ai-avoid="true"
        >
          <Button onClick={onCreateManagedUser} disabled={creatingManagedUser} className="w-full sm:w-auto">
            {creatingManagedUser ? "Creating..." : "Create Closed Account"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

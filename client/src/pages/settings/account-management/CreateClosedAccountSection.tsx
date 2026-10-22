import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMobileKeyboardState } from "@/hooks/use-mobile-keyboard-state";
import { cn } from "@/lib/utils";
import { CreateAccountDashboardNickname } from "./CreateAccountDashboardNickname";
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
  createDashboardNicknameId?: string;
  creatingManagedUser: boolean;
  onCreateEmailInputChange: (value: string) => void;
  onCreateFieldBlur: (field: keyof ManagedUserCreateFieldErrors) => void;
  onCreateFullNameInputChange: (value: string) => void;
  onCreateManagedUser: () => void;
  onCreateRoleInputChange: (value: ManagedUserCreateRole) => void;
  onCreateUsernameInputChange: (value: string) => void;
  onCreateDashboardNicknameIdChange?: (value: string) => void;
}

function getInvalidFieldProps(errorMessage: string | undefined, errorId: string) {
  return errorMessage
    ? {
      "aria-describedby": errorId,
      "aria-invalid": "true" as const,
    }
    : {};
}

export function CreateClosedAccountSection({
  createEmailInput,
  createFieldErrors,
  createFullNameInput,
  createRoleInput,
  createUsernameInput,
  createDashboardNicknameId = "",
  creatingManagedUser,
  onCreateEmailInputChange,
  onCreateFieldBlur,
  onCreateFullNameInputChange,
  onCreateManagedUser,
  onCreateRoleInputChange,
  onCreateUsernameInputChange,
  onCreateDashboardNicknameIdChange,
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
  const usernameValidationProps = getInvalidFieldProps(
    createFieldErrors.createUsernameInput,
    usernameDescription,
  );
  const emailValidationProps = getInvalidFieldProps(
    createFieldErrors.createEmailInput,
    emailDescription,
  );
  const RoleGuidanceIcon = roleGuidance.tone === "warning" ? AlertTriangle : Info;

  return (
    <section className="max-w-3xl rounded-lg border border-border/70 bg-card" aria-labelledby="create-closed-account-title">
      <header className="space-y-1 px-4 pt-5 sm:px-6">
        <h2 id="create-closed-account-title" className="text-lg font-semibold">Create Closed Account</h2>
        <p className="text-sm text-muted-foreground">
          Invite a User, Manager or Admin. Access begins only after email activation.
        </p>
      </header>
      <form className="space-y-4 px-4 pb-4 pt-4 sm:px-6 sm:pb-5" noValidate onSubmit={(event) => {
        event.preventDefault();
        if (!creatingManagedUser) onCreateManagedUser();
      }}>
        <div className="flex gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-2.5 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <p>The user creates their password through email activation. No initial password is required.</p>
        </div>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <div className="min-w-0 space-y-2">
            <label htmlFor="create-closed-account-full-name" className="block min-w-0 text-sm font-medium leading-5">
              Full name <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <Input
              id="create-closed-account-full-name"
              name="closedAccountFullName"
              className="h-11 min-h-11 min-w-0 sm:h-11 sm:min-h-11"
              value={createFullNameInput}
              onChange={(event) => onCreateFullNameInputChange(event.target.value)}
              placeholder="Full name"
              disabled={creatingManagedUser}
              autoComplete="name"
            />
          </div>
          <div className="min-w-0 space-y-2">
            <label htmlFor="create-closed-account-username" className="block min-w-0 text-sm font-medium leading-5">
              Username
            </label>
            <Input
              id="create-closed-account-username"
              name="closedAccountUsername"
              className="h-11 min-h-11 min-w-0 sm:h-11 sm:min-h-11"
              value={createUsernameInput}
              onChange={(event) => onCreateUsernameInputChange(event.target.value)}
              onBlur={() => onCreateFieldBlur("createUsernameInput")}
              placeholder="Username"
              disabled={creatingManagedUser}
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-describedby={usernameDescription}
              {...usernameValidationProps}
            />
            <p id={usernameHelpId} className="break-words text-xs leading-5 text-muted-foreground">
              3-32 characters: letters, numbers, dot, underscore, or hyphen.
            </p>
            {createFieldErrors.createUsernameInput ? (
              <p id={usernameErrorId} className="break-words text-xs leading-5 text-destructive" role="alert">
                {createFieldErrors.createUsernameInput}
              </p>
            ) : null}
          </div>
          <div className="min-w-0 space-y-2">
            <label htmlFor="create-closed-account-email" className="block min-w-0 text-sm font-medium leading-5">
              Email
            </label>
            <Input
              id="create-closed-account-email"
              name="closedAccountEmail"
              className="h-11 min-h-11 min-w-0 sm:h-11 sm:min-h-11"
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
              aria-describedby={emailDescription}
              {...emailValidationProps}
            />
            <p id={emailHelpId} className="break-words text-xs leading-5 text-muted-foreground">
              Activation email is required before first login.
            </p>
            {createFieldErrors.createEmailInput ? (
              <p id={emailErrorId} className="break-words text-xs leading-5 text-destructive" role="alert">
                {createFieldErrors.createEmailInput}
              </p>
            ) : null}
          </div>
          <div className="min-w-0 space-y-2">
            <label htmlFor="create-closed-account-role" className="block min-w-0 text-sm font-medium leading-5">
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
              className="h-11 min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base md:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              disabled={creatingManagedUser}
              aria-describedby={roleDescriptionId}
            >
              <option value="user">User</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>

        <div
          id={roleDescriptionId}
          className={cn(
            "flex gap-2 rounded-md px-3 py-2.5 text-sm",
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
          <div className="min-w-0">
            <span className="font-medium text-foreground">{roleGuidance.label}. </span>
            <span className="text-muted-foreground">{roleGuidance.description}</span>
          </div>
        </div>

        {onCreateDashboardNicknameIdChange ? <CreateAccountDashboardNickname
          key={createRoleInput}
          role={createRoleInput}
          selectedId={createDashboardNicknameId}
          disabled={creatingManagedUser}
          onChange={onCreateDashboardNicknameIdChange}
        /> : null}

        <div
          className="flex flex-wrap gap-x-4 gap-y-2 text-xs"
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
            "-mx-4 flex justify-end border-t border-border/70 bg-card px-4 pb-[calc(var(--safe-area-inset-bottom)+0.75rem)] pt-3 sm:static sm:-mx-6 sm:px-6 sm:pb-0",
            keyboardOpen ? "static" : "sticky bottom-0 z-[var(--z-sticky-content)]",
          )}
          data-floating-ai-avoid="true"
        >
          <Button type="submit" disabled={creatingManagedUser} className="h-11 min-h-11 w-full sm:min-h-11 sm:w-auto">
            {creatingManagedUser ? "Creating..." : "Create Closed Account"}
          </Button>
        </div>
      </form>
    </section>
  );
}

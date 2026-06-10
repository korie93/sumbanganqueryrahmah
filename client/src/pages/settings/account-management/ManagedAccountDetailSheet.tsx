import {
  Activity,
  AlertTriangle,
  CalendarClock,
  Edit3,
  KeyRound,
  Mail,
  ShieldAlert,
  Trash2,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  buildManagedAccountDetailFacts,
  buildManagedAccountRiskSummary,
  buildManagedAccountTimeline,
} from "@/pages/settings/account-management/managed-accounts-utils";
import { getStatusVariant } from "@/pages/settings/account-management/utils";
import type { ManagedUser } from "@/pages/settings/types";

type ManagedAccountDetailSheetProps = {
  deletingManagedUserId: string | null;
  user: ManagedUser | null;
  onBanToggle: (user: ManagedUser) => void;
  onClose: () => void;
  onEditUser: (user: ManagedUser) => void;
  onRequestDelete: (user: ManagedUser) => void;
  onResetPassword: (user: ManagedUser) => void;
  onResendActivation: (user: ManagedUser) => void;
};

function getRiskBadgeVariant(tone: "success" | "warning" | "danger") {
  if (tone === "danger") return "destructive";
  if (tone === "warning") return "secondary";
  return "default";
}

function runDetailAction(user: ManagedUser, action: (user: ManagedUser) => void, onClose: () => void) {
  onClose();
  action(user);
}

export function ManagedAccountDetailSheet({
  deletingManagedUserId,
  user,
  onBanToggle,
  onClose,
  onEditUser,
  onRequestDelete,
  onResetPassword,
  onResendActivation,
}: ManagedAccountDetailSheetProps) {
  const open = Boolean(user);
  const risk = user ? buildManagedAccountRiskSummary(user) : null;
  const facts = user ? buildManagedAccountDetailFacts(user) : [];
  const timeline = user ? buildManagedAccountTimeline(user) : [];

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => {
      if (!nextOpen) onClose();
    }}>
      <SheetContent side="right" className="w-[min(94vw,40rem)] sm:max-w-xl">
        {user ? (
          <div className="flex min-h-full flex-col gap-5">
            <SheetHeader className="pr-8 text-left">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-label-lg text-muted-foreground">
                <UserRound className="h-4 w-4" aria-hidden="true" />
                Managed account
              </div>
              <SheetTitle className="break-words text-2xl">{user.username}</SheetTitle>
              <SheetDescription>
                Review access state, profile details, and account timeline before taking action.
              </SheetDescription>
            </SheetHeader>

            <section className="rounded-2xl border border-border/70 bg-muted/20 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={getRiskBadgeVariant(risk?.tone ?? "success")} className="rounded-full">
                  {risk?.label}
                </Badge>
                <Badge variant="secondary" className="rounded-full">
                  {user.role}
                </Badge>
                <Badge variant={getStatusVariant(user.status, user.isBanned)} className="rounded-full">
                  {user.isBanned ? "banned" : user.status}
                </Badge>
                {user.lockedAt ? (
                  <Badge variant="destructive" className="rounded-full">
                    locked
                  </Badge>
                ) : null}
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{risk?.description}</p>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Activity className="h-4 w-4" aria-hidden="true" />
                Account facts
              </div>
              <dl className="grid gap-2 sm:grid-cols-2">
                {facts.map((fact) => (
                  <div
                    key={fact.id}
                    className="rounded-xl border border-border/70 bg-background/70 p-3"
                  >
                    <dt className="text-xs uppercase tracking-label-md text-muted-foreground">
                      {fact.label}
                    </dt>
                    <dd className="mt-1 break-words text-sm font-medium text-foreground">
                      {fact.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <CalendarClock className="h-4 w-4" aria-hidden="true" />
                Account timeline
              </div>
              <ol className="space-y-2" aria-label={`Account timeline for ${user.username}`}>
                {timeline.map((item) => (
                  <li
                    key={item.id}
                    className="rounded-xl border border-border/70 bg-background/70 p-3"
                  >
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-sm font-medium text-foreground">{item.label}</span>
                      <span className="text-xs text-muted-foreground">{item.value}</span>
                    </div>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {item.description}
                    </p>
                  </li>
                ))}
              </ol>
            </section>

            <SheetFooter className="mt-auto gap-2 border-t border-border/70 pt-4 sm:flex-wrap sm:justify-start sm:space-x-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => runDetailAction(user, onEditUser, onClose)}
              >
                <Edit3 className="mr-2 h-4 w-4" aria-hidden="true" />
                Edit
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => runDetailAction(user, onResetPassword, onClose)}
              >
                <KeyRound className="mr-2 h-4 w-4" aria-hidden="true" />
                Reset
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={user.status !== "pending_activation" || Boolean(user.isBanned)}
                onClick={() => runDetailAction(user, onResendActivation, onClose)}
              >
                <Mail className="mr-2 h-4 w-4" aria-hidden="true" />
                Activate
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => runDetailAction(user, onBanToggle, onClose)}
              >
                {user.isBanned ? (
                  <ShieldAlert className="mr-2 h-4 w-4" aria-hidden="true" />
                ) : (
                  <AlertTriangle className="mr-2 h-4 w-4" aria-hidden="true" />
                )}
                {user.isBanned ? "Unban" : "Ban"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={deletingManagedUserId === user.id}
                onClick={() => runDetailAction(user, onRequestDelete, onClose)}
              >
                <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                {deletingManagedUserId === user.id ? "Deleting..." : "Delete"}
              </Button>
            </SheetFooter>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

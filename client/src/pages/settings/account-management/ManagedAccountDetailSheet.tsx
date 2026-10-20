import { useRef } from "react";
import { AlertTriangle, Edit3, KeyRound, Mail, ShieldAlert, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  buildManagedAccountDetailFacts,
  buildManagedAccountTimeline,
} from "@/pages/settings/account-management/managed-accounts-utils";
import { ManagedAccountLoginAccess } from "@/pages/settings/account-management/ManagedAccountLoginAccess";
import { managedAccountDialogFocusHandoff, type ManagedAccountDialogKind } from "@/pages/settings/account-management/managed-account-dialog-focus";
import type { ManagedUser } from "@/pages/settings/types";
import { ManagedAccountCollectionScope } from "./ManagedAccountCollectionScope";

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
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const actionTransitionRef = useRef(false);
  const facts = user ? buildManagedAccountDetailFacts(user) : [];
  const timeline = user ? buildManagedAccountTimeline(user) : [];

  const runDetailAction = (action: (selectedUser: ManagedUser) => void, dialog: ManagedAccountDialogKind | null) => {
    if (!user) return;
    actionTransitionRef.current = dialog !== null;
    if (dialog) managedAccountDialogFocusHandoff.setForDialog(user.id, dialog, returnFocusRef.current);
    onClose();
    action(user);
  };

  return (
    <Dialog open={Boolean(user)} onOpenChange={(open) => {
      if (!open) onClose();
    }}>
      <DialogContent
        className="flex max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:p-0"
        onOpenAutoFocus={() => {
          returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          actionTransitionRef.current = false;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (!actionTransitionRef.current && returnFocusRef.current?.isConnected) {
            returnFocusRef.current.focus({ preventScroll: true });
          }
        }}
      >
        {user ? (
          <>
            <DialogHeader className="shrink-0 border-b border-border/70 px-4 py-4 pr-12 text-left sm:px-6">
              <DialogTitle>Account details</DialogTitle>
              <DialogDescription>Review {user.username}&apos;s account record and login access before taking action.</DialogDescription>
            </DialogHeader>

            <div role="region" aria-label={`Account details for ${user.username}`} tabIndex={0} className="min-h-0 space-y-5 overflow-y-auto px-4 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-6 [scrollbar-gutter:stable]">
              <section className="space-y-2">
                <div>
                  <h3 className="break-words text-base font-semibold">{user.fullName || user.username}</h3>
                  <p className="break-words text-sm text-muted-foreground">{user.username}{user.email ? ` · ${user.email}` : ""}</p>
                </div>
                <ManagedAccountLoginAccess user={user} />
              </section>

              <section aria-label="Account facts">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                  {facts.filter((fact) => !["username", "full-name", "email"].includes(fact.id)).map((fact) => (
                    <div key={fact.id} className="min-w-0">
                      <dt className="text-xs text-muted-foreground">{fact.id === "status" ? "Account record" : fact.label}</dt>
                      <dd className="mt-1 break-words text-sm font-medium tabular-nums">{fact.id === "status" ? user.status : fact.value}</dd>
                    </div>
                  ))}
                  <div>
                    <dt className="text-xs text-muted-foreground">Password change required</dt>
                    <dd className="mt-1 text-sm font-medium">{user.mustChangePassword ? "Yes" : "No"}</dd>
                  </div>
                </dl>
              </section>

              {(user.role === "user" || user.role === "admin") && user.status !== "deleted" ? (
                <ManagedAccountCollectionScope key={user.id} userId={user.id} role={user.role} />
              ) : null}
              <section className="space-y-2 border-t border-border/70 pt-4">
                <h3 className="text-sm font-semibold">Account timeline</h3>
                <ol className="divide-y divide-border/60" aria-label={`Account timeline for ${user.username}`}>
                  {timeline.map((item) => (
                    <li key={item.id} className="py-2 first:pt-0">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <span className="text-sm font-medium">{item.label}</span>
                        <span className="text-xs tabular-nums text-muted-foreground">{item.value}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                    </li>
                  ))}
                </ol>
              </section>
            </div>

            <DialogFooter className="shrink-0 flex-row flex-wrap justify-end gap-2 border-t border-border/70 px-4 py-3 sm:gap-2 sm:space-x-0 sm:px-6">
              <Button type="button" variant="outline" size="sm" onClick={() => runDetailAction(onResetPassword, "reset")}>
                <KeyRound className="mr-2 h-4 w-4" aria-hidden="true" />Reset
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={user.status !== "pending_activation" || Boolean(user.isBanned)} onClick={() => runDetailAction(onResendActivation, null)}>
                <Mail className="mr-2 h-4 w-4" aria-hidden="true" />Activate
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => runDetailAction(onBanToggle, "ban")}>
                {user.isBanned ? <ShieldAlert className="mr-2 h-4 w-4" aria-hidden="true" /> : <AlertTriangle className="mr-2 h-4 w-4" aria-hidden="true" />}
                {user.isBanned ? "Unban" : "Ban"}
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={deletingManagedUserId === user.id} onClick={() => runDetailAction(onRequestDelete, "delete")}>
                <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />{deletingManagedUserId === user.id ? "Deleting..." : "Delete"}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={onClose}>Close</Button>
              <Button type="button" size="sm" onClick={() => runDetailAction(onEditUser, "edit")}>
                <Edit3 className="mr-2 h-4 w-4" aria-hidden="true" />Edit
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

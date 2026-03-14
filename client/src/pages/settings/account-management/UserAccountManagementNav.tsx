import { Inbox, LifeBuoy, ShieldCheck, UserCog, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { UserAccountManagementTabId } from "@/pages/settings/types";

type UserAccountManagementNavProps = {
  activeTab: UserAccountManagementTabId;
  managedUserCount: number;
  outboxCount: number;
  pendingResetCount: number;
  onSelect: (tab: UserAccountManagementTabId) => void;
};

const NAV_ITEMS: Array<{
  description: string;
  icon: typeof ShieldCheck;
  id: UserAccountManagementTabId;
  label: string;
}> = [
  {
    id: "create-closed-account",
    label: "Create Closed Account",
    description: "Provision new user or admin accounts safely.",
    icon: ShieldCheck,
  },
  {
    id: "local-mail-outbox",
    label: "Local Mail Outbox",
    description: "Review development activation and reset emails.",
    icon: Inbox,
  },
  {
    id: "managed-account",
    label: "Managed Account",
    description: "Search, edit, reset, ban, or delete managed accounts.",
    icon: UserCog,
  },
  {
    id: "pending-password-reset-requests",
    label: "Pending Password Reset Requests",
    description: "Review password reset requests waiting for action.",
    icon: LifeBuoy,
  },
];

export function UserAccountManagementNav({
  activeTab,
  managedUserCount,
  outboxCount,
  pendingResetCount,
  onSelect,
}: UserAccountManagementNavProps) {
  return (
    <aside className="rounded-xl border border-border/60 bg-background/50 p-3 lg:sticky lg:top-24">
      <div className="mb-3 flex items-center gap-2 px-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-semibold">User Account Management</p>
      </div>

      <div className="space-y-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = item.id === activeTab;
          const counter =
            item.id === "managed-account"
              ? managedUserCount
              : item.id === "local-mail-outbox"
                ? outboxCount
                : item.id === "pending-password-reset-requests"
                  ? pendingResetCount
                  : null;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={`w-full rounded-lg border px-3 py-3 text-left transition ${
                active
                  ? "border-primary bg-primary/10"
                  : "border-border/60 bg-background/40 hover:bg-accent/40"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="text-sm font-medium">{item.label}</span>
                  </div>
                  <p className="text-xs leading-5 text-muted-foreground">{item.description}</p>
                </div>
                {counter !== null ? (
                  <Badge variant={active ? "default" : "secondary"}>{counter}</Badge>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

import { Inbox, LifeBuoy, Plus, Users } from "lucide-react";
import { HorizontalScrollHint } from "@/components/HorizontalScrollHint";
import { Badge } from "@/components/ui/badge";
import { getAriaCurrentPageProps } from "@/lib/aria-state-props";
import { cn } from "@/lib/utils";
import type { UserAccountManagementTabId } from "@/pages/settings/types";

type UserAccountManagementNavProps = {
  activeTab: UserAccountManagementTabId;
  pendingResetCount: number;
  onSelect: (tab: UserAccountManagementTabId) => void;
};

const SECTIONS = [
  { id: "managed-account", label: "Managed Account", icon: Users },
  { id: "create-closed-account", label: "Create Closed Account", icon: Plus },
  { id: "pending-password-reset-requests", label: "Pending Password Reset Requests", icon: LifeBuoy },
  { id: "local-mail-outbox", label: "Local Mail Outbox", icon: Inbox },
] as const;

export function UserAccountManagementNav({ activeTab, pendingResetCount, onSelect }: UserAccountManagementNavProps) {
  return (
    <nav aria-label="User Account Management" className="min-w-0 border-b border-border">
      <HorizontalScrollHint viewportClassName="flex gap-1" hint="More sections">
        {SECTIONS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            {...getAriaCurrentPageProps(activeTab === id)}
            data-active={activeTab === id ? "true" : "false"}
            onClick={() => onSelect(id)}
            className={cn(
              "relative inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-3 py-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              activeTab === id ? "border-primary bg-primary/5 text-primary" : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{label}</span>
            {id === "pending-password-reset-requests" && pendingResetCount > 0 ? (
              <Badge variant="destructive" className="min-w-5 justify-center px-1.5 py-0 text-xxs">
                <span className="sr-only">Pending requests: </span>{pendingResetCount}
              </Badge>
            ) : null}
          </button>
        ))}
      </HorizontalScrollHint>
    </nav>
  );
}

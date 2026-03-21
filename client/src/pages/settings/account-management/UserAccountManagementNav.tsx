import { useMemo } from "react";
import { Inbox, LifeBuoy, ShieldCheck, UserCog } from "lucide-react";
import { SideTabNavigation } from "@/components/navigation/SideTabNavigation";
import type { UserAccountManagementTabId } from "@/pages/settings/types";

type UserAccountManagementNavProps = {
  activeTab: UserAccountManagementTabId;
  collapsed: boolean;
  managedUserCount: number;
  mobileOpen: boolean;
  outboxCount: number;
  onCollapsedChange: (value: boolean) => void;
  onMobileOpenChange: (open: boolean) => void;
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
  collapsed,
  managedUserCount,
  mobileOpen,
  outboxCount,
  onCollapsedChange,
  onMobileOpenChange,
  pendingResetCount,
  onSelect,
}: UserAccountManagementNavProps) {
  const items = useMemo(
    () =>
      NAV_ITEMS.map((item) => ({
        key: item.id,
        label: item.label,
        icon: item.icon,
        description: item.description,
        badge:
          item.id === "managed-account"
            ? managedUserCount
            : item.id === "local-mail-outbox"
              ? outboxCount
              : item.id === "pending-password-reset-requests"
                ? pendingResetCount
                : null,
      })),
    [managedUserCount, outboxCount, pendingResetCount],
  );

  return (
    <SideTabNavigation
      items={items}
      selectedKey={activeTab}
      onSelect={(key) => onSelect(key as UserAccountManagementTabId)}
      mobileOpen={mobileOpen}
      onMobileOpenChange={onMobileOpenChange}
      collapsed={collapsed}
      onCollapsedChange={onCollapsedChange}
      menuLabel="Sections"
      navigationLabel="User Account Management"
      expandedWidth={308}
      collapsedWidth={88}
      className="border-border/60 bg-background/60"
    />
  );
}

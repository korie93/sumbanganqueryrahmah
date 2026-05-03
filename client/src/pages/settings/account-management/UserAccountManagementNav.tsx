import { useMemo } from "react";
import { Inbox, LifeBuoy, Menu, ShieldCheck, UserCog } from "lucide-react";
import { LazySideTabNavigation } from "@/components/navigation/LazySideTabNavigation";
import { HorizontalScrollHint } from "@/components/HorizontalScrollHint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
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
  const isMobile = useIsMobile();
  const shouldRenderNavigation = !isMobile || mobileOpen;
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
  const selectedItem = items.find((item) => item.key === activeTab) ?? items[0] ?? null;

  return (
    <>
      {isMobile ? (
        <div className="space-y-3 lg:hidden">
          <div className="rounded-[24px] border border-border/60 bg-background/75 p-4 shadow-sm dark:border-white/10 dark:bg-[hsl(224_38%_12%_/_0.96)] dark:shadow-[0_20px_36px_-28px_hsl(222_72%_5%_/_0.72)]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-foreground/64 dark:text-foreground/76">
                  Account Sections
                </p>
                <p className="truncate text-base font-semibold text-foreground">
                  {selectedItem?.label || "Choose a section"}
                </p>
                {selectedItem?.description ? (
                  <p className="text-xs leading-5 text-foreground/62 dark:text-foreground/74">
                    {selectedItem.description}
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 rounded-full dark:border-white/10 dark:bg-white/[0.03] dark:text-foreground/88 dark:hover:bg-white/[0.06] dark:hover:text-foreground"
                onClick={() => onMobileOpenChange(true)}
              >
                <Menu className="h-4 w-4" />
                Browse
              </Button>
            </div>

            <HorizontalScrollHint
              className="mt-3"
              viewportClassName="-mx-1 flex gap-2 px-1 pb-1"
              hint="Swipe sections"
            >
              {items.map((item) => {
                const Icon = item.icon;
                const active = item.key === activeTab;
                const showBadge = item.badge !== null && item.badge !== undefined;

                return (
                  <button
                    key={`account-nav-mobile-${item.key}`}
                    type="button"
                    onClick={() => onSelect(item.key as UserAccountManagementTabId)}
                    className={cn(
                      "flex min-h-10 min-w-fit items-center gap-2 rounded-full border px-3.5 py-2 text-left text-[13px] font-semibold transition-colors",
                      active
                        ? "border-primary/35 bg-primary/10 text-primary shadow-[inset_0_1px_0_hsl(0_0%_100%_/_0.08)] dark:border-primary/30 dark:bg-primary/14 dark:text-primary-foreground"
                        : "border-border/60 bg-background/80 text-foreground/78 hover:border-primary/20 hover:text-foreground dark:border-white/10 dark:bg-white/[0.03] dark:text-foreground/88 dark:hover:bg-white/[0.06] dark:hover:text-foreground",
                    )}
                  >
                    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-background/80 dark:bg-white/[0.06]">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="max-w-[10rem] truncate leading-tight">{item.label}</span>
                    {showBadge ? (
                      <Badge
                        variant={active ? "default" : "secondary"}
                        className="rounded-full px-2 py-0 text-[10px]"
                      >
                        {item.badge}
                      </Badge>
                    ) : null}
                  </button>
                );
              })}
            </HorizontalScrollHint>
          </div>
        </div>
      ) : null}

      {shouldRenderNavigation ? (
        <LazySideTabNavigation
          items={items}
          selectedKey={activeTab}
          onSelect={(key) => onSelect(key as UserAccountManagementTabId)}
          mobileOpen={mobileOpen}
          onMobileOpenChange={onMobileOpenChange}
          hideMobileTrigger={isMobile}
          collapsed={collapsed}
          onCollapsedChange={onCollapsedChange}
          menuLabel="Sections"
          navigationLabel="User Account Management"
          expandedWidth={308}
          collapsedWidth={88}
          className="border-border/60 bg-background/60"
        />
      ) : null}
    </>
  );
}

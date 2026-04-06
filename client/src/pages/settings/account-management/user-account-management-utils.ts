import type { UserAccountManagementBadgeSummary } from "@/pages/settings/account-management/user-account-management-shared";

type UserAccountManagementBadgeCounts = {
  managedUserCount: number;
  outboxCount: number;
  pendingResetCount: number;
};

export function getUserAccountManagementDescription(isMobile: boolean) {
  return isMobile
    ? "Manage closed accounts, mail previews, and reset requests in focused sections."
    : "Organize account creation, mail previews, managed users, and pending reset requests into focused sections without crowding the main Security page.";
}

export function buildUserAccountManagementBadgeSummary({
  managedUserCount,
  outboxCount,
  pendingResetCount,
}: UserAccountManagementBadgeCounts): UserAccountManagementBadgeSummary[] {
  return [
    {
      label: "Accounts",
      total: managedUserCount,
      variant: "secondary",
    },
    {
      label: "Outbox",
      total: outboxCount,
      variant: "outline",
    },
    {
      label: "Reset Requests",
      total: pendingResetCount,
      variant: "outline",
    },
  ];
}

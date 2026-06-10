import type {
  AccountActionQueueItem,
  AccountHealthMetric,
  UserAccountManagementBadgeSummary,
} from "@/pages/settings/account-management/user-account-management-shared";
import type { ManagedUser } from "@/pages/settings/types";

type UserAccountManagementBadgeCounts = {
  managedUserCount: number;
  outboxCount: number;
  pendingResetCount: number;
};

type AccountManagementOverviewInput = {
  managedUserTotal: number;
  managedUsers: ManagedUser[];
  outboxTotal: number;
  pendingResetTotal: number;
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

export function buildAccountHealthMetrics({
  managedUserTotal,
  managedUsers,
  pendingResetTotal,
}: AccountManagementOverviewInput): AccountHealthMetric[] {
  const visibleCount = managedUsers.length;
  const visibleActiveCount = managedUsers.filter(
    (user) => user.status === "active" && !user.lockedAt && !user.isBanned,
  ).length;
  const visibleLockedCount = managedUsers.filter((user) => Boolean(user.lockedAt)).length;
  const visibleBannedCount = managedUsers.filter((user) => Boolean(user.isBanned)).length;
  const restrictedCount = visibleLockedCount + visibleBannedCount;

  return [
    {
      id: "directory-total",
      label: "Directory total",
      value: managedUserTotal,
      description: "All managed accounts in this workspace.",
      tone: "neutral",
    },
    {
      id: "visible-active",
      label: "Visible active",
      value: visibleActiveCount,
      description: `Healthy accounts on this page (${visibleCount} visible).`,
      tone: visibleCount > 0 && visibleActiveCount === visibleCount ? "success" : "neutral",
    },
    {
      id: "visible-restricted",
      label: "Visible locked/banned",
      value: restrictedCount,
      description: "Accounts on this page that need access review.",
      tone: restrictedCount > 0 ? "danger" : "success",
    },
    {
      id: "pending-resets",
      label: "Pending resets",
      value: pendingResetTotal,
      description: "Password reset requests waiting for review.",
      tone: pendingResetTotal > 0 ? "warning" : "success",
    },
  ];
}

export function buildAccountActionQueue({
  managedUsers,
  outboxTotal,
  pendingResetTotal,
}: AccountManagementOverviewInput): AccountActionQueueItem[] {
  const restrictedCount = managedUsers.filter((user) => user.lockedAt || user.isBanned).length;
  const pendingActivationCount = managedUsers.filter(
    (user) => user.status === "pending_activation" && !user.isBanned,
  ).length;
  const passwordRequiredCount = managedUsers.filter((user) => user.mustChangePassword).length;
  const queue: AccountActionQueueItem[] = [];

  if (pendingResetTotal > 0) {
    queue.push({
      id: "pending-reset-requests",
      label: "Review reset requests",
      count: pendingResetTotal,
      description: "Approve or reject user-submitted password reset requests.",
      priority: "high",
      targetTab: "pending-password-reset-requests",
    });
  }

  if (restrictedCount > 0) {
    queue.push({
      id: "restricted-visible-accounts",
      label: "Check restricted accounts",
      count: restrictedCount,
      description: "Locked or banned accounts are visible on the current page.",
      priority: "high",
      targetTab: "managed-account",
    });
  }

  if (pendingActivationCount > 0) {
    queue.push({
      id: "pending-activation-visible",
      label: "Resend activations",
      count: pendingActivationCount,
      description: "Activation emails may need to be resent for visible accounts.",
      priority: "medium",
      targetTab: "managed-account",
    });
  }

  if (passwordRequiredCount > 0) {
    queue.push({
      id: "password-required-visible",
      label: "Follow up password changes",
      count: passwordRequiredCount,
      description: "Visible accounts must change password at next login.",
      priority: "medium",
      targetTab: "managed-account",
    });
  }

  if (outboxTotal > 0) {
    queue.push({
      id: "local-outbox-review",
      label: "Review local mail outbox",
      count: outboxTotal,
      description: "Activation and reset mail previews are available for inspection.",
      priority: "low",
      targetTab: "local-mail-outbox",
    });
  }

  if (queue.length === 0) {
    return [
      {
        id: "no-urgent-actions",
        label: "No urgent account actions",
        count: 0,
        description: "No reset, lock, ban, activation, or outbox signals need attention.",
        priority: "low",
        targetTab: "managed-account",
      },
    ];
  }

  return queue;
}

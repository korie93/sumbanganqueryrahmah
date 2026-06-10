import type {
  ManagedAccountAttentionStatus,
  ManagedAccountAttentionSummary,
  ManagedAccountAttentionSummaryItem,
  ManagedAccountDetailFact,
  ManagedAccountsEmptyStateContent,
  ManagedAccountRiskSummary,
  ManagedAccountTimelineItem,
  ManagedAccountsRoleFilter,
  ManagedAccountsStatusFilter,
} from "@/pages/settings/account-management/managed-accounts-shared";
import {
  MANAGED_ACCOUNT_ATTENTION_FILTERS,
} from "@/pages/settings/account-management/managed-accounts-shared";
import { formatDateTime } from "@/pages/settings/account-management/utils";
import {
  normalizeManagedUserRoleFilter,
  normalizeManagedUserStatusFilter,
} from "@/pages/settings/settings-managed-user-filter-utils";
import type { ManagedUser } from "@/pages/settings/types";

export function normalizeManagedAccountsRoleFilter(value: string): ManagedAccountsRoleFilter {
  return normalizeManagedUserRoleFilter(value);
}

export function normalizeManagedAccountsStatusFilter(value: string): ManagedAccountsStatusFilter {
  return normalizeManagedUserStatusFilter(value);
}

export function getManagedAccountsEmptyMessage(options: {
  loading: boolean;
  total: number;
  hasActiveFilters: boolean;
}) {
  return getManagedAccountsEmptyState(options).title;
}

export function getManagedAccountsEmptyState(options: {
  loading: boolean;
  total: number;
  hasActiveFilters: boolean;
}): ManagedAccountsEmptyStateContent {
  if (options.loading) {
    return {
      title: "Loading users...",
      description: "Refreshing the managed account list.",
    };
  }

  if (options.total === 0 && !options.hasActiveFilters) {
    return {
      title: "No managed accounts found.",
      description: "Create a managed account when a user needs access to this workspace.",
    };
  }

  return {
    title: "No managed accounts match the current filters.",
    description: "Clear the active filters or adjust the search term to widen the result set.",
    actionLabel: "Clear filters",
  };
}

export function getManagedAccountAttentionStatus(
  user: ManagedUser,
): ManagedAccountAttentionStatus | null {
  if (user.isBanned) {
    return "banned";
  }

  if (user.lockedAt) {
    return "locked";
  }

  if (user.status === "banned" || user.status === "locked") {
    return user.status;
  }

  if (
    user.status === "pending_activation"
    || user.status === "suspended"
    || user.status === "disabled"
  ) {
    return user.status;
  }

  return null;
}

export function buildManagedAccountAttentionSummary(
  users: ManagedUser[],
): ManagedAccountAttentionSummary {
  const counts = new Map<ManagedAccountAttentionStatus, number>();

  for (const user of users) {
    const attentionStatus = getManagedAccountAttentionStatus(user);
    if (!attentionStatus) {
      continue;
    }
    counts.set(attentionStatus, (counts.get(attentionStatus) || 0) + 1);
  }

  const items = MANAGED_ACCOUNT_ATTENTION_FILTERS.map((option) => {
    const tone: ManagedAccountAttentionSummaryItem["tone"] =
      option.value === "banned" || option.value === "locked"
      ? "danger"
      : "warning";

    return {
      status: option.value,
      label: option.label,
      count: counts.get(option.value) || 0,
      tone,
    };
  });

  return {
    totalAttentionCount: items.reduce((total, item) => total + item.count, 0),
    visibleCount: users.length,
    items,
  };
}

export function buildManagedAccountRiskSummary(user: ManagedUser): ManagedAccountRiskSummary {
  if (user.isBanned) {
    return {
      label: "Banned",
      description: "This account is blocked from signing in until a superuser unbans it.",
      tone: "danger",
    };
  }

  if (user.lockedAt) {
    return {
      label: "Locked",
      description: user.lockedReason || "This account is locked after a security event.",
      tone: "danger",
    };
  }

  if (user.status === "pending_activation") {
    return {
      label: "Activation pending",
      description: "The user still needs to activate the account before normal access.",
      tone: "warning",
    };
  }

  if (user.mustChangePassword) {
    return {
      label: "Password change required",
      description: "The user must set a new password at the next successful sign-in.",
      tone: "warning",
    };
  }

  if (user.status !== "active") {
    return {
      label: "Non-active",
      description: `The account is currently marked as ${user.status}.`,
      tone: "warning",
    };
  }

  return {
    label: "Healthy",
    description: "No visible access restrictions are active for this account.",
    tone: "success",
  };
}

export function buildManagedAccountDetailFacts(user: ManagedUser): ManagedAccountDetailFact[] {
  return [
    { id: "username", label: "Username", value: user.username },
    { id: "full-name", label: "Full name", value: user.fullName || "-" },
    { id: "email", label: "Email", value: user.email || "-" },
    { id: "role", label: "Role", value: user.role },
    { id: "status", label: "Status", value: user.isBanned ? "banned" : user.status },
    { id: "created-by", label: "Created by", value: user.createdBy || "System" },
    { id: "created-at", label: "Created", value: formatDateTime(user.createdAt) },
    { id: "updated-at", label: "Updated", value: formatDateTime(user.updatedAt) },
    { id: "last-login", label: "Last login", value: formatDateTime(user.lastLoginAt) },
    {
      id: "failed-attempts",
      label: "Failed attempts",
      value: user.failedLoginAttempts.toLocaleString(),
    },
  ];
}

export function buildManagedAccountTimeline(user: ManagedUser): ManagedAccountTimelineItem[] {
  const timeline: ManagedAccountTimelineItem[] = [
    {
      id: "created",
      label: "Account created",
      value: formatDateTime(user.createdAt),
      description: user.createdBy ? `Created by ${user.createdBy}.` : "Created by the system.",
      timestamp: user.createdAt,
    },
  ];

  if (user.activatedAt) {
    timeline.push({
      id: "activated",
      label: "Account activated",
      value: formatDateTime(user.activatedAt),
      description: "Activation completed and the account became usable.",
      timestamp: user.activatedAt,
    });
  } else if (user.status === "pending_activation") {
    timeline.push({
      id: "activation-pending",
      label: "Activation pending",
      value: "-",
      description: "No activation timestamp has been recorded yet.",
      timestamp: null,
    });
  }

  if (user.passwordChangedAt) {
    timeline.push({
      id: "password-changed",
      label: "Password changed",
      value: formatDateTime(user.passwordChangedAt),
      description: "The account password was changed after creation.",
      timestamp: user.passwordChangedAt,
    });
  }

  if (user.mustChangePassword) {
    timeline.push({
      id: "password-change-required",
      label: "Password change required",
      value: "-",
      description: "The user must change password at the next sign-in.",
      timestamp: null,
    });
  }

  if (user.lastLoginAt) {
    timeline.push({
      id: "last-login",
      label: "Last successful login",
      value: formatDateTime(user.lastLoginAt),
      description: "Most recent authenticated sign-in recorded for this account.",
      timestamp: user.lastLoginAt,
    });
  }

  if (user.lockedAt) {
    timeline.push({
      id: "locked",
      label: "Account locked",
      value: formatDateTime(user.lockedAt),
      description: user.lockedReason || "The account is currently locked.",
      timestamp: user.lockedAt,
    });
  }

  if (user.updatedAt && user.updatedAt !== user.createdAt) {
    timeline.push({
      id: "updated",
      label: "Account updated",
      value: formatDateTime(user.updatedAt),
      description: "Profile, role, status, or security state was updated.",
      timestamp: user.updatedAt,
    });
  }

  return timeline.sort((left, right) => {
    if (!left.timestamp && !right.timestamp) return 0;
    if (!left.timestamp) return 1;
    if (!right.timestamp) return -1;
    return Date.parse(right.timestamp) - Date.parse(left.timestamp);
  });
}

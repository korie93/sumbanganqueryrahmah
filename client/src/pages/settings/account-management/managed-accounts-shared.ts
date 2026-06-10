import type { ManagedUser } from "@/pages/settings/types";
import type {
  ManagedUsersPaginationState,
  ManagedUsersQueryState,
} from "@/pages/settings/useSettingsManagedUserData";

export type ManagedAccountsSectionProps = {
  deletingManagedUserId: string | null;
  loading: boolean;
  managedUsers: ManagedUser[];
  pagination: ManagedUsersPaginationState;
  query: ManagedUsersQueryState;
  onBanToggle: (user: ManagedUser) => void;
  onDeleteUser: (user: ManagedUser) => void;
  onEditUser: (user: ManagedUser) => void;
  onQueryChange: (query: Partial<ManagedUsersQueryState>) => void;
  onRefresh: () => void;
  onResetPassword: (user: ManagedUser) => void;
  onResendActivation: (user: ManagedUser) => void;
};

export type ManagedAccountsRoleFilter = ManagedUsersQueryState["role"];
export type ManagedAccountsStatusFilter = ManagedUsersQueryState["status"];
export type ManagedAccountAttentionStatus = Exclude<
  ManagedAccountsStatusFilter,
  "all" | "active"
>;

export type ManagedAccountRiskSummary = {
  label: string;
  description: string;
  tone: "success" | "warning" | "danger";
};

export type ManagedAccountDetailFact = {
  id: string;
  label: string;
  value: string;
};

export type ManagedAccountTimelineItem = {
  id: string;
  label: string;
  value: string;
  description: string;
  timestamp: string | null;
};

export type ManagedAccountAttentionSummaryItem = {
  status: ManagedAccountAttentionStatus;
  label: string;
  count: number;
  tone: "warning" | "danger";
};

export type ManagedAccountAttentionSummary = {
  totalAttentionCount: number;
  visibleCount: number;
  items: ManagedAccountAttentionSummaryItem[];
};

export type ManagedAccountsEmptyStateContent = {
  title: string;
  description: string;
  actionLabel?: string;
};

export const MANAGED_ACCOUNT_ROLE_LABELS: Record<ManagedAccountsRoleFilter, string> = {
  all: "All roles",
  admin: "Admin",
  manager: "Manager",
  user: "User",
};

export const MANAGED_ACCOUNT_STATUS_LABELS: Record<ManagedAccountsStatusFilter, string> = {
  all: "All statuses",
  active: "Active",
  pending_activation: "Pending activation",
  suspended: "Suspended",
  disabled: "Disabled",
  locked: "Locked",
  banned: "Banned",
};

export const MANAGED_ACCOUNT_ROLE_OPTIONS: Array<{
  value: ManagedAccountsRoleFilter;
  label: string;
}> = [
  { value: "all", label: MANAGED_ACCOUNT_ROLE_LABELS.all },
  { value: "user", label: MANAGED_ACCOUNT_ROLE_LABELS.user },
  { value: "admin", label: MANAGED_ACCOUNT_ROLE_LABELS.admin },
  { value: "manager", label: MANAGED_ACCOUNT_ROLE_LABELS.manager },
];

export const MANAGED_ACCOUNT_STATUS_OPTIONS: Array<{
  value: ManagedAccountsStatusFilter;
  label: string;
}> = [
  { value: "all", label: MANAGED_ACCOUNT_STATUS_LABELS.all },
  { value: "active", label: MANAGED_ACCOUNT_STATUS_LABELS.active },
  {
    value: "pending_activation",
    label: MANAGED_ACCOUNT_STATUS_LABELS.pending_activation,
  },
  { value: "suspended", label: MANAGED_ACCOUNT_STATUS_LABELS.suspended },
  { value: "disabled", label: MANAGED_ACCOUNT_STATUS_LABELS.disabled },
  { value: "locked", label: MANAGED_ACCOUNT_STATUS_LABELS.locked },
  { value: "banned", label: MANAGED_ACCOUNT_STATUS_LABELS.banned },
];

export const MANAGED_ACCOUNT_ATTENTION_FILTERS: Array<{
  value: ManagedAccountAttentionStatus;
  label: string;
  description: string;
}> = [
  {
    value: "locked",
    label: MANAGED_ACCOUNT_STATUS_LABELS.locked,
    description: "Accounts locked by security controls.",
  },
  {
    value: "banned",
    label: MANAGED_ACCOUNT_STATUS_LABELS.banned,
    description: "Accounts blocked from signing in.",
  },
  {
    value: "pending_activation",
    label: MANAGED_ACCOUNT_STATUS_LABELS.pending_activation,
    description: "Invited users who have not activated yet.",
  },
  {
    value: "suspended",
    label: MANAGED_ACCOUNT_STATUS_LABELS.suspended,
    description: "Accounts paused by administrators.",
  },
  {
    value: "disabled",
    label: MANAGED_ACCOUNT_STATUS_LABELS.disabled,
    description: "Accounts disabled from normal access.",
  },
];

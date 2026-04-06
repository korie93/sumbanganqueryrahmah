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

export const MANAGED_ACCOUNT_ROLE_OPTIONS: Array<{
  value: ManagedAccountsRoleFilter;
  label: string;
}> = [
  { value: "all", label: "All roles" },
  { value: "user", label: "user" },
  { value: "admin", label: "admin" },
];

export const MANAGED_ACCOUNT_STATUS_OPTIONS: Array<{
  value: ManagedAccountsStatusFilter;
  label: string;
}> = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "active" },
  { value: "pending_activation", label: "pending_activation" },
  { value: "suspended", label: "suspended" },
  { value: "disabled", label: "disabled" },
  { value: "locked", label: "locked" },
  { value: "banned", label: "banned" },
];

import type {
  DevMailOutboxPreview,
  ManagedUser,
  PendingPasswordResetRequest,
  UserAccountManagementTabId,
} from "@/pages/settings/types";
import type {
  DevMailOutboxPaginationState,
  DevMailOutboxQueryState,
} from "@/pages/settings/useSettingsDevMailOutbox";
import type {
  ManagedUsersPaginationState,
  ManagedUsersQueryState,
  PendingResetRequestsPaginationState,
  PendingResetRequestsQueryState,
} from "@/pages/settings/useSettingsManagedUserData";
import type { ManagedUserCreateFieldErrors } from "@/pages/settings/settings-managed-user-create-utils";
import type { ManagedUserCreateRole } from "@/pages/settings/settings-managed-user-create-shared";

export interface UserAccountManagementSectionProps {
  clearingDevMailOutbox: boolean;
  createEmailInput: string;
  createFieldErrors: ManagedUserCreateFieldErrors;
  createFullNameInput: string;
  createRoleInput: ManagedUserCreateRole;
  createUsernameInput: string;
  creatingManagedUser: boolean;
  deletingDevMailOutboxId: string | null;
  deletingManagedUserId: string | null;
  devMailOutboxEnabled: boolean;
  devMailOutboxEntries: DevMailOutboxPreview[];
  devMailOutboxLoading: boolean;
  devMailOutboxPagination: DevMailOutboxPaginationState;
  devMailOutboxQuery: DevMailOutboxQueryState;
  isSuperuser: boolean;
  managedUsers: ManagedUser[];
  managedUsersLoading: boolean;
  managedUsersPagination: ManagedUsersPaginationState;
  managedUsersQuery: ManagedUsersQueryState;
  onClearDevMailOutbox: () => void;
  onCreateEmailInputChange: (value: string) => void;
  onCreateFieldBlur: (field: keyof ManagedUserCreateFieldErrors) => void;
  onCreateFullNameInputChange: (value: string) => void;
  onCreateManagedUser: () => void;
  onCreateRoleInputChange: (value: ManagedUserCreateRole) => void;
  onCreateUsernameInputChange: (value: string) => void;
  onDeleteDevMailOutboxEntry: (previewId: string) => void;
  onDeleteManagedUser: (user: ManagedUser) => void;
  onDevMailOutboxRefresh: () => void;
  onDevMailOutboxQueryChange: (query: Partial<DevMailOutboxQueryState>) => void;
  onEditManagedUser: (user: ManagedUser) => void;
  onManagedBanToggle: (user: ManagedUser) => void;
  onManagedResetPassword: (user: ManagedUser) => void;
  onManagedResendActivation: (user: ManagedUser) => void;
  onManagedUsersRefresh: () => void;
  onManagedUsersQueryChange: (query: Partial<ManagedUsersQueryState>) => void;
  onPendingResetRequestsRefresh: () => void;
  onPendingResetRequestsQueryChange: (query: Partial<PendingResetRequestsQueryState>) => void;
  pendingResetRequests: PendingPasswordResetRequest[];
  pendingResetRequestsLoading: boolean;
  pendingResetRequestsPagination: PendingResetRequestsPaginationState;
  pendingResetRequestsQuery: PendingResetRequestsQueryState;
}

export type UserAccountManagementBadgeSummary = {
  label: string;
  total: number;
  variant: "secondary" | "outline";
};

export type AccountHealthMetric = {
  id: string;
  label: string;
  value: number;
  description: string;
  tone: "neutral" | "success" | "warning" | "danger";
};

export type AccountActionQueueItem = {
  id: string;
  label: string;
  count: number;
  description: string;
  priority: "high" | "medium" | "low";
  targetTab: UserAccountManagementTabId;
};

export type UserAccountManagementSectionState = {
  activeTab: UserAccountManagementTabId;
  isPending: boolean;
  mobileNavOpen: boolean;
  navCollapsed: boolean;
  onSelectTab: (tab: UserAccountManagementTabId) => void;
  setMobileNavOpen: (open: boolean) => void;
  setNavCollapsed: (collapsed: boolean) => void;
};

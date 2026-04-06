export type AccountManagementPreloadState = {
  devMailOutboxLoaded: boolean;
  devMailOutboxLoading: boolean;
  isSuperuser: boolean;
  managedUsersLoaded: boolean;
  managedUsersLoading: boolean;
  pendingResetRequestsLoaded: boolean;
  pendingResetRequestsLoading: boolean;
};

export type AccountManagementPreloadKey =
  | "managedUsers"
  | "pendingResetRequests"
  | "devMailOutbox";

export function getPendingAccountManagementPreloadKeys(
  state: AccountManagementPreloadState,
): AccountManagementPreloadKey[] {
  if (!state.isSuperuser) {
    return [];
  }

  const pending: AccountManagementPreloadKey[] = [];

  if (!state.managedUsersLoaded && !state.managedUsersLoading) {
    pending.push("managedUsers");
  }

  if (!state.pendingResetRequestsLoaded && !state.pendingResetRequestsLoading) {
    pending.push("pendingResetRequests");
  }

  if (!state.devMailOutboxLoaded && !state.devMailOutboxLoading) {
    pending.push("devMailOutbox");
  }

  return pending;
}

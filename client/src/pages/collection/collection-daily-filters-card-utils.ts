export function getCollectionDailyScopeLabel(options: {
  canManage: boolean;
  currentUsername: string;
  selectedUsersLabel: string;
}) {
  return options.canManage ? options.selectedUsersLabel : options.currentUsername;
}

export function getCollectionDailyStaffScopeDescription(canManage: boolean) {
  return canManage
    ? "Choose one or more staff nicknames before editing target or calendar."
    : "Your current account is used automatically for this daily view.";
}

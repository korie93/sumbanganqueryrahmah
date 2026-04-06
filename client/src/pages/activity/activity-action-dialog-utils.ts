export function getKickDialogDescription(username?: string) {
  return `Are you sure you want to force logout "${username ?? ""}"? The user can log in again.`;
}

export function getBanDialogDescription(username?: string) {
  return `Are you sure you want to ban "${username ?? ""}"? The user will not be able to log in until unbanned.`;
}

export function getDeleteDialogDescription(username?: string) {
  return `Are you sure you want to delete the activity log for "${username ?? ""}"? This action cannot be undone.`;
}

export function getBulkDeleteDialogDescription(selectedBulkCount: number) {
  return `Are you sure you want to delete ${selectedBulkCount} selected activity log(s)? This action cannot be undone.`;
}

export function getUnbanDialogDescription(username?: string) {
  return `Are you sure you want to unban "${username ?? ""}"? The user will be able to log in again.`;
}

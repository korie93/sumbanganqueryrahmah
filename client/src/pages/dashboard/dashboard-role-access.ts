export function canManageDashboardLoginLogs(role: string | null | undefined): boolean {
  return role === "admin" || role === "superuser";
}

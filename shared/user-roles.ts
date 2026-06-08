export const USER_ROLES = ["user", "admin", "manager", "superuser"] as const;
export const MANAGEABLE_USER_ROLES = ["user", "admin", "manager"] as const;

export type UserRole = (typeof USER_ROLES)[number];
export type ManageableUserRole = (typeof MANAGEABLE_USER_ROLES)[number];

export const MANAGER_ALLOWED_MODULES = [
  "home",
  "general-search",
  "collection-report",
  "dashboard",
  "analysis",
  "import",
] as const;

export type ManagerAllowedModule = (typeof MANAGER_ALLOWED_MODULES)[number];

export function isManagerRole(role: unknown): role is "manager" {
  return String(role || "").trim().toLowerCase() === "manager";
}

export function canManagerAccessModule(moduleId: string): moduleId is ManagerAllowedModule {
  return MANAGER_ALLOWED_MODULES.includes(moduleId as ManagerAllowedModule);
}

export function canViewAllStaff(role: unknown): boolean {
  const normalized = String(role || "").trim().toLowerCase();
  return normalized === "manager" || normalized === "superuser";
}

const AUTHENTICATED_ROLE_HOME_PAGE: Record<string, string> = {
  user: "general-search",
  admin: "home",
  manager: "home",
  superuser: "home",
};

export function resolveAuthenticatedRoleHomePage(role?: string | null): string {
  return AUTHENTICATED_ROLE_HOME_PAGE[String(role || "").trim().toLowerCase()] ?? "general-search";
}

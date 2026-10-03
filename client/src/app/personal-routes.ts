/** Personal self-service is authenticated, not a configurable system module. */
export function isPersonalPage(page: string) {
  return page === "account" || page === "security";
}

export function canAccessPersonalPage(role: string | undefined) {
  return role === "superuser" || role === "manager" || role === "admin" || role === "user";
}

const FORCED_PASSWORD_CHANGE_ALLOWLIST = new Set([
  "GET:/api/auth/me",
  "GET:/api/me",
  "POST:/api/auth/change-password",
  "PATCH:/api/me/credentials",
  "POST:/api/activity/logout",
  "POST:/api/activity/heartbeat",
]);

export function canAccessDuringForcedPasswordChange(method: string, path: string) {
  return FORCED_PASSWORD_CHANGE_ALLOWLIST.has(`${method.toUpperCase()}:${path}`);
}

export type ClientMaintenanceMode = "soft" | "hard";

export type ClientMaintenanceStateLike = {
  maintenance?: unknown;
  type?: unknown;
} | null | undefined;

export function normalizeClientMaintenanceMode(value: unknown): ClientMaintenanceMode {
  return value === "soft" ? "soft" : "hard";
}

export function canRoleBypassMaintenance(role: string | null | undefined) {
  return role === "admin" || role === "superuser";
}

export function isHardMaintenanceState(state: ClientMaintenanceStateLike) {
  return state?.maintenance === true
    && normalizeClientMaintenanceMode(state.type) === "hard";
}

export function isSoftMaintenanceState(state: ClientMaintenanceStateLike) {
  return state?.maintenance === true
    && normalizeClientMaintenanceMode(state.type) === "soft";
}

export function shouldRedirectForMaintenance(
  state: ClientMaintenanceStateLike,
  role: string | null | undefined,
) {
  return isHardMaintenanceState(state) && !canRoleBypassMaintenance(role);
}

export function shouldShowSoftMaintenanceBanner(
  state: ClientMaintenanceStateLike,
  role: string | null | undefined,
) {
  return isSoftMaintenanceState(state) && !canRoleBypassMaintenance(role);
}

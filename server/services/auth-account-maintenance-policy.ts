import type { MaintenanceState } from "../config/system-settings";
import { ERROR_CODES } from "../../shared/error-codes";
import { AuthAccountError } from "./auth-account-types";

export type AuthMaintenanceStateLoader = () => Promise<MaintenanceState>;

export const DEFAULT_MAINTENANCE_LOGIN_MESSAGE =
  "Sistem sedang diselenggara. Sila cuba semula sebentar lagi.";

export function canRoleBypassMaintenance(role: string | null | undefined) {
  return role === "admin" || role === "superuser";
}

export function shouldBlockLoginForMaintenance(
  state: MaintenanceState,
  role: string | null | undefined,
) {
  return state.maintenance === true
    && state.type === "hard"
    && !canRoleBypassMaintenance(role);
}

export function buildMaintenanceAuthErrorExtra(state: MaintenanceState) {
  return {
    maintenance: true,
    type: state.type,
    startTime: state.startTime,
    endTime: state.endTime,
  };
}

export async function assertLoginAllowedDuringMaintenance(params: {
  getMaintenanceState?: AuthMaintenanceStateLoader | undefined;
  role: string | null | undefined;
  createAuditLog?: (() => Promise<void>) | undefined;
}) {
  if (canRoleBypassMaintenance(params.role)) {
    return;
  }

  if (!params.getMaintenanceState) {
    return;
  }

  const state = await params.getMaintenanceState();
  if (!shouldBlockLoginForMaintenance(state, params.role)) {
    return;
  }

  await params.createAuditLog?.();
  throw new AuthAccountError(
    503,
    ERROR_CODES.MAINTENANCE_ACTIVE,
    state.message || DEFAULT_MAINTENANCE_LOGIN_MESSAGE,
    buildMaintenanceAuthErrorExtra(state),
  );
}

import type {
  ManagedUsersQueryState,
  PendingResetRequestsQueryState,
} from "@/pages/settings/settings-managed-user-data-shared"

export type ManagedUserRoleFilter = ManagedUsersQueryState["role"]
export type ManagedUserStatusFilter = ManagedUsersQueryState["status"]
export type PendingResetStatusFilter = PendingResetRequestsQueryState["status"]

export function normalizeManagedUserRoleFilter(value: unknown): ManagedUserRoleFilter {
  const normalized = String(value || "all").trim().toLowerCase()
  return normalized === "admin" || normalized === "user" ? normalized : "all"
}

export function normalizeManagedUserStatusFilter(value: unknown): ManagedUserStatusFilter {
  const normalized = String(value || "all").trim().toLowerCase()

  switch (normalized) {
    case "active":
    case "pending_activation":
    case "suspended":
    case "disabled":
    case "locked":
    case "banned":
      return normalized
    default:
      return "all"
  }
}

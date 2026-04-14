import type { ActivityRecord } from "@/pages/activity/types"
import { formatActivityTime } from "@/pages/activity/utils"

export function buildActivityRowAriaLabel(activity: ActivityRecord, browserLabel: string) {
  const loginLabel = formatActivityTime(activity.loginTime)
  const logoutLabel = activity.logoutTime ? formatActivityTime(activity.logoutTime) : "belum logout"
  const ipAddress = String(activity.ipAddress || "").trim() || "IP tidak diketahui"
  const browser = String(browserLabel || "").trim() || "browser tidak diketahui"

  return `Activity for ${activity.username}, role ${activity.role}, status ${activity.status.toLowerCase()}, login ${loginLabel}, logout ${logoutLabel}, browser ${browser}, IP ${ipAddress}`
}

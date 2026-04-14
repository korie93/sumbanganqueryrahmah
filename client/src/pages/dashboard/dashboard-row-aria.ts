import type { RoleData, TopUser } from "@/pages/dashboard/types";

type DashboardTopUserRowAriaOptions = {
  formattedLastLogin: string;
  index: number;
  user: TopUser;
};

type DashboardRoleDistributionRowAriaOptions = {
  item: RoleData;
};

function normalizeDashboardValue(value: string | number | null | undefined) {
  const normalized = String(value ?? "-").replace(/\s+/g, " ").trim();
  return normalized || "-";
}

export function buildDashboardTopUserRowAriaLabel({
  formattedLastLogin,
  index,
  user,
}: DashboardTopUserRowAriaOptions) {
  return [
    `Top active user ${index}`,
    normalizeDashboardValue(user.username),
    `role ${normalizeDashboardValue(user.role)}`,
    `${normalizeDashboardValue(user.loginCount)} logins`,
    `last login ${normalizeDashboardValue(formattedLastLogin)}`,
  ].join(", ");
}

export function buildDashboardRoleDistributionRowAriaLabel({
  item,
}: DashboardRoleDistributionRowAriaOptions) {
  return [
    `Role ${normalizeDashboardValue(item.role)}`,
    `${normalizeDashboardValue(item.count)} users`,
  ].join(", ");
}

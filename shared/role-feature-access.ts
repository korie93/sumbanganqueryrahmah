/** Configurable page access is separate from protected actions within a page. */
export const ROLE_FEATURE_IDS = [
  "home", "import", "saved", "viewer", "general-search", "collection-report",
  "analysis", "dashboard", "monitor", "activity", "audit-logs", "backup", "settings",
] as const;

export type RoleFeatureId = (typeof ROLE_FEATURE_IDS)[number];
export type ConfigurableFeatureRole = "admin" | "manager" | "user";

export function normalizeRoleFeatureId(feature: string): string {
  return feature === "audit" ? "audit-logs" : feature;
}

export function getRoleFeatureRestriction(role: string, feature: string): string | null {
  const id = normalizeRoleFeatureId(feature);
  if (!(ROLE_FEATURE_IDS as readonly string[]).includes(id)) return "Unknown feature.";
  if (role === "superuser") return null;
  if (role !== "admin" && role !== "manager" && role !== "user") return "Unsupported role.";
  if (id === "audit-logs" || id === "backup") {
    return "Protected superuser-only access; this cannot be granted by a tab permission.";
  }
  if (id === "settings" && role !== "admin") {
    return "Settings is restricted to admin and superuser; account and role controls remain superuser-only.";
  }
  if (role === "manager" && (id === "saved" || id === "viewer" || id === "monitor")) {
    return "This module is outside the manager role's supported access.";
  }
  return null;
}

export function isRoleFeatureConfigurable(role: string, feature: string): boolean {
  return role !== "superuser" && getRoleFeatureRestriction(role, feature) === null;
}

export function canAccessRoleFeature(
  role: string | undefined,
  feature: string,
  tabs: Readonly<Record<string, boolean>> | null | undefined,
): boolean {
  if (!role || getRoleFeatureRestriction(role, feature) !== null) return false;
  if (role === "superuser") return true;
  return tabs?.[normalizeRoleFeatureId(feature)] === true;
}

export function parseRoleFeatureSettingKey(key: string): {
  role: ConfigurableFeatureRole;
  feature: RoleFeatureId;
} | null {
  const match = /^tab_(admin|manager|user)_(.+)_enabled$/.exec(key);
  if (!match) return null;
  const feature = match[2].replace(/_/g, "-");
  if (!(ROLE_FEATURE_IDS as readonly string[]).includes(feature)) return null;
  return { role: match[1] as ConfigurableFeatureRole, feature: feature as RoleFeatureId };
}

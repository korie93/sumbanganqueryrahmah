import { parseRoleFeatureSettingKey } from "../../shared/role-feature-access";
import type { RuntimeWsSharedBus } from "../ws/runtime-shared-bus";

export function subscribeRolePermissionInvalidation(bus: RuntimeWsSharedBus | null, clear: (role?: string) => void) {
  return bus?.subscribe((event) => {
    if (event.type !== "broadcast" || event.payload.type !== "settings_updated") return;
    const key = event.payload.key;
    if (typeof key !== "string") return;
    const roleFeature = parseRoleFeatureSettingKey(key);
    if (roleFeature) clear(roleFeature.role);
    else if (key === "canViewSystemPerformance") clear("admin");
  }) ?? (() => {});
}

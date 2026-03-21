import type {
  MaintenanceState,
  SystemSettingCategory,
  SystemSettingItem,
} from "../config/system-settings";
import type { PostgresStorage } from "../storage-postgres";

type AppConfig = Awaited<ReturnType<PostgresStorage["getAppConfig"]>>;
type SettingsUpdateRecord = {
  status: "updated" | "unchanged" | "forbidden" | "not_found" | "requires_confirmation" | "invalid";
  message: string;
  setting?: SystemSettingItem;
  shouldBroadcast?: boolean;
};

type SettingsStorage = Pick<
  PostgresStorage,
  | "createAuditLog"
  | "getAppConfig"
  | "getRoleTabVisibility"
  | "getSettingsForRole"
  | "updateSystemSetting"
>;

type SettingsServiceDeps = {
  clearTabVisibilityCache: () => void;
  invalidateRuntimeSettingsCache: () => void;
  invalidateMaintenanceCache: () => void;
  getMaintenanceStateCached: (force?: boolean) => Promise<MaintenanceState>;
  broadcastWsMessage: (payload: Record<string, unknown>) => void;
};

type UpdateSettingInput = {
  role: string;
  key: string;
  value: unknown;
  confirmCritical: boolean;
  updatedBy: string;
};

export class SettingsService {
  constructor(
    private readonly storage: SettingsStorage,
    private readonly deps: SettingsServiceDeps,
  ) {}

  async getAppConfig(): Promise<AppConfig> {
    return this.storage.getAppConfig();
  }

  async getTabVisibility(role: string): Promise<Record<string, boolean>> {
    return this.storage.getRoleTabVisibility(role);
  }

  async getSettingsForRole(role: string): Promise<SystemSettingCategory[]> {
    return this.storage.getSettingsForRole(role);
  }

  async updateSetting(input: UpdateSettingInput): Promise<SettingsUpdateRecord> {
    const value = (input.value ?? null) as string | number | boolean | null;
    const result = await this.storage.updateSystemSetting({
      role: input.role,
      settingKey: input.key,
      value,
      confirmCritical: input.confirmCritical,
      updatedBy: input.updatedBy,
    });

    if (result.status !== "updated") {
      return result;
    }

    this.deps.clearTabVisibilityCache();
    this.deps.invalidateRuntimeSettingsCache();

    await this.storage.createAuditLog({
      action: result.setting?.isCritical ? "CRITICAL_SETTING_UPDATED" : "SETTING_UPDATED",
      performedBy: input.updatedBy,
      targetResource: input.key,
      details: `Updated setting ${input.key} to "${String(result.setting?.value ?? "")}"`,
    });

    if (result.shouldBroadcast) {
      this.deps.invalidateMaintenanceCache();
      const maintenanceState = await this.deps.getMaintenanceStateCached(true);
      this.deps.broadcastWsMessage({
        type: "maintenance_update",
        maintenance: maintenanceState.maintenance,
        message: maintenanceState.message,
        mode: maintenanceState.type,
        startTime: maintenanceState.startTime,
        endTime: maintenanceState.endTime,
      });
      return result;
    }

    this.deps.broadcastWsMessage({
      type: "settings_updated",
      key: input.key,
      updatedBy: input.updatedBy,
    });

    return result;
  }
}

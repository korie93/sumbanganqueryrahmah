import type {
  MaintenanceState,
  SystemSettingCategory,
  SystemSettingItem,
} from "../../config/system-settings";
import { PostgresAiStorage } from "./postgres-ai-storage";

export class PostgresSettingsStorage extends PostgresAiStorage {
  async getSettingsForRole(role: string): Promise<SystemSettingCategory[]> {
    await this.ensureSettingsTables();
    return this.settingsRepository.getSettingsForRole(role);
  }

  async getBooleanSystemSetting(key: string, fallback = false): Promise<boolean> {
    await this.ensureSettingsTables();
    return this.settingsRepository.getBooleanSystemSetting(key, fallback);
  }

  async getRoleTabVisibility(role: string): Promise<Record<string, boolean>> {
    await this.ensureSettingsTables();
    return this.settingsRepository.getRoleTabVisibility(role);
  }

  async updateSystemSetting(params: {
    role: string;
    settingKey: string;
    value: string | number | boolean | null;
    confirmCritical?: boolean;
    updatedBy: string;
  }): Promise<{
    status: "updated" | "unchanged" | "forbidden" | "not_found" | "requires_confirmation" | "invalid";
    message: string;
    setting?: SystemSettingItem;
    shouldBroadcast?: boolean;
  }> {
    await this.ensureSettingsTables();
    return this.settingsRepository.updateSystemSetting(params);
  }

  async getMaintenanceState(now: Date = new Date()): Promise<MaintenanceState> {
    await this.ensureSettingsTables();
    return this.settingsRepository.getMaintenanceState(now);
  }

  async getAppConfig(): Promise<{
    systemName: string;
    sessionTimeoutMinutes: number;
    heartbeatIntervalMinutes: number;
    wsIdleMinutes: number;
    aiEnabled: boolean;
    semanticSearchEnabled: boolean;
    aiTimeoutMs: number;
    searchResultLimit: number;
    viewerRowsPerPage: number;
  }> {
    await this.ensureSettingsTables();
    return this.settingsRepository.getAppConfig();
  }
}

import { db } from "../db-postgres";
import type { SettingInputType } from "../config/system-settings";

export type SettingsBootstrapSqlExecutor = Pick<typeof db, "execute">;

export type SettingsBootstrapTaskState = {
  ready: boolean;
  initPromise: Promise<void> | null;
};

export type SettingsSeedItem = {
  categoryName: string;
  key: string;
  label: string;
  description: string;
  type: SettingInputType;
  value: string;
  defaultValue: string;
  isCritical: boolean;
};

export type SettingsCategorySeedItem = {
  name: string;
  description: string;
};

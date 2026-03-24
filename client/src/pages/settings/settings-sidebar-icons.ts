import {
  Activity,
  BrainCircuit,
  Database,
  DatabaseBackup,
  KeyRound,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  UserCog,
} from "lucide-react";
import type { SettingCategory } from "@/pages/settings/types";

const CATEGORY_ICON_BY_ID = {
  general: Settings2,
  security: ShieldCheck,
  "ai-search": BrainCircuit,
  "data-management": Database,
  "backup-restore": DatabaseBackup,
  "roles-permissions": KeyRound,
  "system-monitoring": Activity,
  "account-management": UserCog,
} as const;

const CATEGORY_ICON_BY_NAME = {
  General: Settings2,
  Security: ShieldCheck,
  "AI & Search": BrainCircuit,
  "Data Management": Database,
  "Backup & Restore": DatabaseBackup,
  "Roles & Permissions": KeyRound,
  "System Monitoring": Activity,
  "Account Management": UserCog,
} as const;

export function getSettingsCategoryIcon(category: SettingCategory) {
  return (
    CATEGORY_ICON_BY_ID[category.id as keyof typeof CATEGORY_ICON_BY_ID] ||
    CATEGORY_ICON_BY_NAME[category.name as keyof typeof CATEGORY_ICON_BY_NAME] ||
    SlidersHorizontal
  );
}

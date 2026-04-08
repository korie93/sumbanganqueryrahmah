import type { TabVisibility } from "@/app/types";
import type { SettingCategory } from "@/pages/settings/types";

export const ACCOUNT_MANAGEMENT_CATEGORY_ID = "account-management";
export const BACKUP_SETTINGS_CATEGORY_ID = "backup-restore";

export function canAccessBackupCategory(
  role: string | undefined,
  tabVisibility: TabVisibility | undefined,
) {
  if (!role) return false;
  if (role === "superuser") return true;
  if (!tabVisibility) return true;
  return tabVisibility.backup !== false;
}

export function buildSettingsSidebarCategories({
  canAccessAccountManagement,
  canAccessBackupSection,
  categories,
}: {
  canAccessAccountManagement: boolean;
  canAccessBackupSection: boolean;
  categories: SettingCategory[];
}): SettingCategory[] {
  return [
    ...categories,
    ...(canAccessBackupSection
      ? [{
          id: BACKUP_SETTINGS_CATEGORY_ID,
          name: "Backup & Restore",
          description: "Create, export, delete, and restore backups from one settings area.",
          settings: [],
        }]
      : []),
    ...(canAccessAccountManagement
      ? [{
          id: ACCOUNT_MANAGEMENT_CATEGORY_ID,
          name: "Account Management",
          description: "Manage user lifecycle, reset requests, and local mail outbox.",
          settings: [],
        }]
      : []),
  ];
}

export function findSettingsDisplayCategory({
  currentCategory,
  isAccountManagementCategory,
  isBackupCategory,
  sidebarCategories,
}: {
  currentCategory: SettingCategory | null;
  isAccountManagementCategory: boolean;
  isBackupCategory: boolean;
  sidebarCategories: SettingCategory[];
}) {
  if (isAccountManagementCategory) {
    return sidebarCategories.find((category) => category.id === ACCOUNT_MANAGEMENT_CATEGORY_ID) || null;
  }
  if (isBackupCategory) {
    return sidebarCategories.find((category) => category.id === BACKUP_SETTINGS_CATEGORY_ID) || null;
  }
  return currentCategory;
}

export function resolveNextSelectedSettingsCategory({
  initialSectionId,
  selectedCategory,
  sidebarCategories,
}: {
  initialSectionId?: string | undefined;
  selectedCategory: string;
  sidebarCategories: SettingCategory[];
}) {
  if (sidebarCategories.length === 0) return null;

  const requestedSection = initialSectionId
    && sidebarCategories.some((category) => category.id === initialSectionId)
    ? initialSectionId
    : null;
  const selectedStillValid = sidebarCategories.some((category) => category.id === selectedCategory);

  if (requestedSection && selectedCategory !== requestedSection) {
    return requestedSection;
  }

  if (!selectedStillValid) {
    return sidebarCategories[0]?.id || null;
  }

  return null;
}

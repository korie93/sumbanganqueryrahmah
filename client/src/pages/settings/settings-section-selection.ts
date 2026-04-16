import { ACTIVE_SETTINGS_SECTION_KEY } from "@/app/constants";
import { safeGetStorageItem } from "@/lib/browser-storage";

export function resolveRequestedSettingsSection(params: {
  initialSectionId?: string;
  search?: string;
  storage: Storage | undefined | null;
}) {
  const searchParams = new URLSearchParams(params.search || "");
  const sectionFromUrl = searchParams.get("section");

  return (
    sectionFromUrl
    || params.initialSectionId
    || safeGetStorageItem(params.storage, ACTIVE_SETTINGS_SECTION_KEY)
    || undefined
  );
}

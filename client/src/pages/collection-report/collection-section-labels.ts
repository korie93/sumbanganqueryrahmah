import type { CollectionSubPage } from "./types";

const desktopLabels: Record<CollectionSubPage, string> = {
  save: "Simpan",
  records: "Rekod",
  summary: "Summary",
  "monthly-comparison": "Monthly",
  daily: "Daily",
  "billing-principal": "OSP",
  "nickname-summary": "Nickname",
  "manage-nicknames": "Manage",
};

/** Use words from the full accessible name so compact labels also support voice navigation. */
export function getCollectionSectionShortLabel(key: string, label: string): string {
  return Object.prototype.hasOwnProperty.call(desktopLabels, key)
    ? desktopLabels[key as CollectionSubPage]
    : label;
}

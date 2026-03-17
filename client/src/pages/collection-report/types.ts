import type { LucideIcon } from "lucide-react";

export type CollectionSubPage =
  | "save"
  | "records"
  | "summary"
  | "daily"
  | "nickname-summary"
  | "manage-nicknames";
export type NicknameDialogStep = "nickname" | "setup" | "login";

export type CollectionSidebarItem = {
  key: CollectionSubPage;
  label: string;
  icon: LucideIcon;
};

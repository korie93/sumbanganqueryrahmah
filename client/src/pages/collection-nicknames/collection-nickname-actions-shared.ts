import type { CollectionNicknameManagementDataValue } from "@/pages/collection-nicknames/useCollectionNicknameManagementData";
import type { CollectionNicknameManagementDialogsValue } from "@/pages/collection-nicknames/useCollectionNicknameManagementDialogs";

export type CollectionNicknameActionOptions = {
  nicknameData: CollectionNicknameManagementDataValue;
  dialogs: CollectionNicknameManagementDialogsValue;
  onNicknameListChanged?: () => void;
};

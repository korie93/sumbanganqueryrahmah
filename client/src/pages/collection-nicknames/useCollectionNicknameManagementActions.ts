import type { CollectionStaffNickname } from "@/lib/api";
import type { CollectionNicknameActionOptions } from "@/pages/collection-nicknames/collection-nickname-actions-shared";
import { useCollectionNicknameGroupActions } from "@/pages/collection-nicknames/useCollectionNicknameGroupActions";
import { useCollectionNicknameStaffActions } from "@/pages/collection-nicknames/useCollectionNicknameStaffActions";

type UseCollectionNicknameManagementActionsValue = {
  savingAssignment: boolean;
  saveAssignment: () => Promise<void>;
  createGroup: () => Promise<void>;
  openChangeLeader: () => void;
  saveLeader: () => Promise<void>;
  confirmDeleteGroup: () => Promise<void>;
  createNickname: () => Promise<void>;
  saveEditNickname: () => Promise<void>;
  updateStatus: (item: CollectionStaffNickname, isActive: boolean) => Promise<void>;
  deleteNickname: () => Promise<void>;
  confirmResetPassword: () => Promise<void>;
  confirmUngroup: () => Promise<void>;
};

export type CollectionNicknameManagementActionsValue =
  UseCollectionNicknameManagementActionsValue;

export function useCollectionNicknameManagementActions(
  options: CollectionNicknameActionOptions,
): UseCollectionNicknameManagementActionsValue {
  const groupActions = useCollectionNicknameGroupActions(options);
  const staffActions = useCollectionNicknameStaffActions(options);

  return {
    savingAssignment: groupActions.savingAssignment,
    saveAssignment: groupActions.saveAssignment,
    createGroup: groupActions.createGroup,
    openChangeLeader: groupActions.openChangeLeader,
    saveLeader: groupActions.saveLeader,
    confirmDeleteGroup: groupActions.confirmDeleteGroup,
    createNickname: staffActions.createNickname,
    saveEditNickname: staffActions.saveEditNickname,
    updateStatus: staffActions.updateStatus,
    deleteNickname: staffActions.deleteNickname,
    confirmResetPassword: staffActions.confirmResetPassword,
    confirmUngroup: groupActions.confirmUngroup,
  };
}

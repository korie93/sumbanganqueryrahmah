import { CollectionNicknameGroupFormDialogs } from "@/pages/collection-nicknames/CollectionNicknameGroupFormDialogs";
import { CollectionNicknameStaffFormDialogs } from "@/pages/collection-nicknames/CollectionNicknameStaffFormDialogs";
import type { CollectionNicknameDialogsProps } from "@/pages/collection-nicknames/collection-nickname-dialog-types";

export type CollectionNicknameFormDialogsProps = Pick<
  CollectionNicknameDialogsProps,
  | "leaderOptions"
  | "createGroupOpen"
  | "createLeaderId"
  | "creatingGroup"
  | "changeLeaderOpen"
  | "changeLeaderId"
  | "savingLeader"
  | "addOpen"
  | "newNickname"
  | "newRoleScope"
  | "addingNickname"
  | "editingNickname"
  | "editValue"
  | "editRoleScope"
  | "savingEdit"
  | "onCreateGroupOpenChange"
  | "onCreateLeaderIdChange"
  | "onCreateGroup"
  | "onChangeLeaderOpenChange"
  | "onChangeLeaderIdChange"
  | "onSaveLeader"
  | "onAddOpenChange"
  | "onNewNicknameChange"
  | "onNewRoleScopeChange"
  | "onCreateNickname"
  | "onEditingNicknameOpenChange"
  | "onEditValueChange"
  | "onEditRoleScopeChange"
  | "onSaveEditNickname"
>;

export function CollectionNicknameFormDialogs({
  leaderOptions,
  createGroupOpen,
  createLeaderId,
  creatingGroup,
  changeLeaderOpen,
  changeLeaderId,
  savingLeader,
  addOpen,
  newNickname,
  newRoleScope,
  addingNickname,
  editingNickname,
  editValue,
  editRoleScope,
  savingEdit,
  onCreateGroupOpenChange,
  onCreateLeaderIdChange,
  onCreateGroup,
  onChangeLeaderOpenChange,
  onChangeLeaderIdChange,
  onSaveLeader,
  onAddOpenChange,
  onNewNicknameChange,
  onNewRoleScopeChange,
  onCreateNickname,
  onEditingNicknameOpenChange,
  onEditValueChange,
  onEditRoleScopeChange,
  onSaveEditNickname,
}: CollectionNicknameFormDialogsProps) {
  return (
    <>
      <CollectionNicknameGroupFormDialogs
        leaderOptions={leaderOptions}
        createGroupOpen={createGroupOpen}
        createLeaderId={createLeaderId}
        creatingGroup={creatingGroup}
        changeLeaderOpen={changeLeaderOpen}
        changeLeaderId={changeLeaderId}
        savingLeader={savingLeader}
        onCreateGroupOpenChange={onCreateGroupOpenChange}
        onCreateLeaderIdChange={onCreateLeaderIdChange}
        onCreateGroup={onCreateGroup}
        onChangeLeaderOpenChange={onChangeLeaderOpenChange}
        onChangeLeaderIdChange={onChangeLeaderIdChange}
        onSaveLeader={onSaveLeader}
      />
      <CollectionNicknameStaffFormDialogs
        addOpen={addOpen}
        newNickname={newNickname}
        newRoleScope={newRoleScope}
        addingNickname={addingNickname}
        editingNickname={editingNickname}
        editValue={editValue}
        editRoleScope={editRoleScope}
        savingEdit={savingEdit}
        onAddOpenChange={onAddOpenChange}
        onNewNicknameChange={onNewNicknameChange}
        onNewRoleScopeChange={onNewRoleScopeChange}
        onCreateNickname={onCreateNickname}
        onEditingNicknameOpenChange={onEditingNicknameOpenChange}
        onEditValueChange={onEditValueChange}
        onEditRoleScopeChange={onEditRoleScopeChange}
        onSaveEditNickname={onSaveEditNickname}
      />
    </>
  );
}

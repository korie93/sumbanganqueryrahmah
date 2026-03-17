import type { CollectionNicknameDialogsProps } from "@/pages/collection-nicknames/CollectionNicknameDialogs";
import type { GroupListPanelProps } from "@/pages/collection-nicknames/GroupListPanel";
import type { NicknameAssignmentPanelProps } from "@/pages/collection-nicknames/NicknameAssignmentPanel";
import type { CollectionNicknameManagementActionsValue } from "@/pages/collection-nicknames/useCollectionNicknameManagementActions";
import type { CollectionNicknameManagementDataValue } from "@/pages/collection-nicknames/useCollectionNicknameManagementData";
import type { CollectionNicknameManagementDialogsValue } from "@/pages/collection-nicknames/useCollectionNicknameManagementDialogs";

type BuildManageCollectionNicknamePageViewModelsOptions = {
  currentNickname: string;
  nicknameData: CollectionNicknameManagementDataValue;
  dialogs: CollectionNicknameManagementDialogsValue;
  actions: CollectionNicknameManagementActionsValue;
};

type ManageCollectionNicknamePageViewModels = {
  summaryText: string;
  groupList: GroupListPanelProps;
  assignment: NicknameAssignmentPanelProps;
  dialogs: CollectionNicknameDialogsProps;
};

export function buildManageCollectionNicknamePageViewModels({
  currentNickname,
  nicknameData,
  dialogs,
  actions,
}: BuildManageCollectionNicknamePageViewModelsOptions): ManageCollectionNicknamePageViewModels {
  return {
    summaryText: `Total nickname: ${nicknameData.nicknames.length} | Active: ${nicknameData.activeAvailable}${
      currentNickname ? ` | Staff semasa: ${currentNickname}` : ""
    }`,
    groupList: {
      loadingGroups: nicknameData.loadingGroups,
      filteredGroups: nicknameData.filteredGroups,
      expandedGroupIds: nicknameData.expandedGroupIds,
      selectedGroupId: nicknameData.selectedGroupId,
      groupSearch: nicknameData.groupSearch,
      nicknameIdByName: nicknameData.nicknameIdByName,
      onGroupSearchChange: nicknameData.setGroupSearch,
      onToggleExpandGroup: nicknameData.toggleExpandGroup,
      onSelectGroup: nicknameData.trySelectGroup,
      onUngroup: (groupId, nicknameId) => dialogs.setPendingUngroup({ groupId, nicknameId }),
    },
    assignment: {
      selectedGroup: nicknameData.selectedGroup,
      selectedGroupId: nicknameData.selectedGroupId,
      assignedActive: nicknameData.assignedActive,
      activeAvailable: nicknameData.activeAvailable,
      unsaved: nicknameData.unsaved,
      nicknameSearch: nicknameData.nicknameSearch,
      loadingNicknames: nicknameData.loadingNicknames,
      filteredNicknames: nicknameData.filteredNicknames,
      assignedIds: nicknameData.assignedIds,
      savingAssignment: actions.savingAssignment,
      statusBusyId: dialogs.statusBusyId,
      resettingNicknameId: dialogs.resettingNicknameId,
      deletingNicknameId: dialogs.deletingNicknameId,
      onNicknameSearchChange: nicknameData.setNicknameSearch,
      onOpenCreateGroup: () => dialogs.setCreateGroupOpen(true),
      onOpenChangeLeader: actions.openChangeLeader,
      onDeleteSelectedGroup: () => {
        if (nicknameData.selectedGroup) {
          dialogs.setPendingDeleteGroup(nicknameData.selectedGroup);
        }
      },
      onOpenAddNickname: () => dialogs.setAddOpen(true),
      onSelectAll: nicknameData.selectAll,
      onClearAll: nicknameData.clearAll,
      onSaveAssignment: () => void actions.saveAssignment(),
      onToggleAssigned: nicknameData.toggleAssigned,
      onEditNickname: dialogs.startEditingNickname,
      onDeactivateNickname: dialogs.setPendingDeactivate,
      onActivateNickname: (item) => void actions.updateStatus(item, true),
      onResetNicknamePassword: dialogs.setPendingResetPassword,
      onDeleteNickname: dialogs.setPendingDeleteNickname,
    },
    dialogs: {
      leaderOptions: nicknameData.leaderOptions,
      createGroupOpen: dialogs.createGroupOpen,
      createLeaderId: dialogs.createLeaderId,
      creatingGroup: dialogs.creatingGroup,
      changeLeaderOpen: dialogs.changeLeaderOpen,
      changeLeaderId: dialogs.changeLeaderId,
      savingLeader: dialogs.savingLeader,
      addOpen: dialogs.addOpen,
      newNickname: dialogs.newNickname,
      newRoleScope: dialogs.newRoleScope,
      addingNickname: dialogs.addingNickname,
      editingNickname: dialogs.editingNickname,
      editValue: dialogs.editValue,
      editRoleScope: dialogs.editRoleScope,
      savingEdit: dialogs.savingEdit,
      pendingDeactivate: dialogs.pendingDeactivate,
      statusBusyId: dialogs.statusBusyId,
      pendingDeleteGroup: dialogs.pendingDeleteGroup,
      deletingGroup: dialogs.deletingGroup,
      pendingDeleteNickname: dialogs.pendingDeleteNickname,
      deletingNicknameId: dialogs.deletingNicknameId,
      pendingResetPassword: dialogs.pendingResetPassword,
      resettingNicknameId: dialogs.resettingNicknameId,
      pendingUngroup: dialogs.pendingUngroup,
      ungrouping: dialogs.ungrouping,
      confirmSwitchOpen: nicknameData.confirmSwitchOpen,
      onCreateGroupOpenChange: dialogs.setCreateGroupOpen,
      onCreateLeaderIdChange: dialogs.setCreateLeaderId,
      onCreateGroup: () => void actions.createGroup(),
      onChangeLeaderOpenChange: dialogs.setChangeLeaderOpen,
      onChangeLeaderIdChange: dialogs.setChangeLeaderId,
      onSaveLeader: () => void actions.saveLeader(),
      onAddOpenChange: dialogs.setAddOpen,
      onNewNicknameChange: dialogs.setNewNickname,
      onNewRoleScopeChange: dialogs.setNewRoleScope,
      onCreateNickname: () => void actions.createNickname(),
      onEditingNicknameOpenChange: (open) => {
        if (!open) dialogs.setEditingNickname(null);
      },
      onEditValueChange: dialogs.setEditValue,
      onEditRoleScopeChange: dialogs.setEditRoleScope,
      onSaveEditNickname: () => void actions.saveEditNickname(),
      onPendingDeactivateOpenChange: (open) => {
        if (!open) dialogs.setPendingDeactivate(null);
      },
      onConfirmDeactivate: () => {
        if (dialogs.pendingDeactivate) {
          void actions.updateStatus(dialogs.pendingDeactivate, false);
        }
      },
      onPendingDeleteGroupOpenChange: (open) => {
        if (!open) dialogs.setPendingDeleteGroup(null);
      },
      onConfirmDeleteGroup: () => void actions.confirmDeleteGroup(),
      onPendingDeleteNicknameOpenChange: (open) => {
        if (!open) dialogs.setPendingDeleteNickname(null);
      },
      onConfirmDeleteNickname: () => void actions.deleteNickname(),
      onPendingResetPasswordOpenChange: (open) => {
        if (!open) dialogs.setPendingResetPassword(null);
      },
      onConfirmResetPassword: () => void actions.confirmResetPassword(),
      onPendingUngroupOpenChange: (open) => {
        if (!open) dialogs.setPendingUngroup(null);
      },
      onConfirmUngroup: () => void actions.confirmUngroup(),
      onConfirmSwitchOpenChange: (open) => {
        if (!open) nicknameData.setConfirmSwitchOpen(false);
      },
      onConfirmSwitch: nicknameData.confirmGroupSwitch,
    },
  };
}

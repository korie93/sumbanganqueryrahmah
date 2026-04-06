import { useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  createCollectionAdminGroup,
  deleteCollectionAdminGroup,
  updateCollectionAdminGroup,
} from "@/lib/api";
import { parseApiError } from "@/pages/collection/utils";
import type { CollectionNicknameActionOptions } from "@/pages/collection-nicknames/collection-nickname-actions-shared";
import { buildCollectionNicknameMemberIds } from "@/pages/collection-nicknames/collection-nickname-actions-utils";
import { normalizeCollectionNicknameIds } from "@/pages/collection-nicknames/utils";

export function useCollectionNicknameGroupActions({
  nicknameData,
  dialogs,
  onNicknameListChanged,
}: CollectionNicknameActionOptions) {
  const { toast } = useToast();
  const [savingAssignment, setSavingAssignment] = useState(false);

  // In-flight refs guard against the React closure race where two rapid clicks
  // both read the state flag as false before the first state update is committed.
  const saveAssignmentRef = useRef(false);
  const createGroupRef = useRef(false);
  const saveLeaderRef = useRef(false);
  const confirmDeleteGroupRef = useRef(false);
  const confirmUngroupRef = useRef(false);

  const saveAssignment = async () => {
    if (!nicknameData.selectedGroup || savingAssignment || saveAssignmentRef.current) return;
    saveAssignmentRef.current = true;
    setSavingAssignment(true);
    try {
      const leaderId = nicknameData.selectedGroup.leaderNicknameId || "";
      const nextMembers = buildCollectionNicknameMemberIds({
        assignedIds: nicknameData.assignedIds,
        excludedId: leaderId,
        nicknameById: nicknameData.nicknameById,
      });
      const response = await updateCollectionAdminGroup(nicknameData.selectedGroup.id, {
        memberNicknameIds: nextMembers,
      });
      const updated = response?.group;
      if (updated) {
        nicknameData.setGroups((previous) =>
          previous.map((group) => (group.id === updated.id ? updated : group)),
        );
        const saved = normalizeCollectionNicknameIds(updated.memberNicknameIds || []);
        nicknameData.setAssignedIds(saved);
        nicknameData.setSavedAssignedIds(saved);
      }
      toast({
        title: "Assignment Saved",
        description: `Assignment untuk ${nicknameData.selectedGroup.leaderNickname} berjaya disimpan.`,
      });
    } catch (error: unknown) {
      toast({
        title: "Failed to Save Assignment",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      saveAssignmentRef.current = false;
      setSavingAssignment(false);
    }
  };

  const createGroup = async () => {
    if (!dialogs.createLeaderId || dialogs.creatingGroup || createGroupRef.current) return;
    createGroupRef.current = true;
    dialogs.setCreatingGroup(true);
    try {
      const response = await createCollectionAdminGroup({
        leaderNicknameId: dialogs.createLeaderId,
        memberNicknameIds: [],
      });
      dialogs.setCreateGroupOpen(false);
      dialogs.setCreateLeaderId("");
      toast({
        title: "Admin Group Created",
        description: "Group admin berjaya ditambah.",
      });
      await nicknameData.reloadData();
      onNicknameListChanged?.();
      if (response?.group?.id) nicknameData.setSelectedGroupId(response.group.id);
    } catch (error: unknown) {
      toast({
        title: "Failed to Create Group",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      createGroupRef.current = false;
      dialogs.setCreatingGroup(false);
    }
  };

  const openChangeLeader = () => {
    if (!nicknameData.selectedGroup) return;
    dialogs.openChangeLeader(nicknameData.selectedGroup.leaderNicknameId || "");
  };

  const saveLeader = async () => {
    if (!nicknameData.selectedGroup || !dialogs.changeLeaderId || dialogs.savingLeader || saveLeaderRef.current) return;
    saveLeaderRef.current = true;
    dialogs.setSavingLeader(true);
    try {
      const nextMembers = buildCollectionNicknameMemberIds({
        assignedIds: nicknameData.assignedIds,
        excludedId: dialogs.changeLeaderId,
        nicknameById: nicknameData.nicknameById,
      });
      const response = await updateCollectionAdminGroup(nicknameData.selectedGroup.id, {
        leaderNicknameId: dialogs.changeLeaderId,
        memberNicknameIds: nextMembers,
      });
      const updated = response?.group;
      if (updated) {
        nicknameData.setGroups((previous) =>
          previous.map((group) => (group.id === updated.id ? updated : group)),
        );
        const saved = normalizeCollectionNicknameIds(updated.memberNicknameIds || []);
        nicknameData.setAssignedIds(saved);
        nicknameData.setSavedAssignedIds(saved);
      }
      dialogs.setChangeLeaderOpen(false);
      toast({
        title: "Leader Updated",
        description: "Leader group berjaya dikemaskini.",
      });
      onNicknameListChanged?.();
    } catch (error: unknown) {
      toast({
        title: "Failed to Update Leader",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      saveLeaderRef.current = false;
      dialogs.setSavingLeader(false);
    }
  };

  const confirmDeleteGroup = async () => {
    if (!dialogs.pendingDeleteGroup || dialogs.deletingGroup || confirmDeleteGroupRef.current) return;
    confirmDeleteGroupRef.current = true;
    dialogs.setDeletingGroup(true);
    try {
      await deleteCollectionAdminGroup(dialogs.pendingDeleteGroup.id);
      dialogs.setPendingDeleteGroup(null);
      toast({
        title: "Group Deleted",
        description: "Admin nickname group berjaya dipadam.",
      });
      await nicknameData.reloadData();
      onNicknameListChanged?.();
    } catch (error: unknown) {
      toast({
        title: "Failed to Delete Group",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      confirmDeleteGroupRef.current = false;
      dialogs.setDeletingGroup(false);
    }
  };

  const confirmUngroup = async () => {
    const pendingUngroup = dialogs.pendingUngroup;
    if (!pendingUngroup || dialogs.ungrouping || confirmUngroupRef.current) return;
    const group = nicknameData.groups.find((item) => item.id === pendingUngroup.groupId);
    if (!group) {
      dialogs.setPendingUngroup(null);
      return;
    }
    confirmUngroupRef.current = true;
    dialogs.setUngrouping(true);
    try {
      const nextMembers = normalizeCollectionNicknameIds(
        (group.memberNicknameIds || []).filter((id) => id !== pendingUngroup.nicknameId),
      );
      const response = await updateCollectionAdminGroup(group.id, {
        memberNicknameIds: nextMembers,
      });
      const updated = response?.group;
      if (updated) {
        nicknameData.setGroups((previous) =>
          previous.map((item) => (item.id === updated.id ? updated : item)),
        );
      }
      dialogs.setPendingUngroup(null);
      toast({
        title: "Ungroup Berjaya",
        description: "Relationship grouping dibuang.",
      });
    } catch (error: unknown) {
      toast({
        title: "Failed to Ungroup",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      confirmUngroupRef.current = false;
      dialogs.setUngrouping(false);
    }
  };

  return {
    savingAssignment,
    saveAssignment,
    createGroup,
    openChangeLeader,
    saveLeader,
    confirmDeleteGroup,
    confirmUngroup,
  };
}

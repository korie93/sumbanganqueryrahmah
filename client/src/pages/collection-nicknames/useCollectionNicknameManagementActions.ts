import { useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  createCollectionAdminGroup,
  createCollectionNickname,
  deleteCollectionAdminGroup,
  deleteCollectionNickname,
  resetCollectionNicknamePassword,
  setCollectionNicknameStatus,
  type CollectionStaffNickname,
  updateCollectionAdminGroup,
  updateCollectionNickname,
} from "@/lib/api";
import type { CollectionNicknameManagementDataValue } from "@/pages/collection-nicknames/useCollectionNicknameManagementData";
import type { CollectionNicknameManagementDialogsValue } from "@/pages/collection-nicknames/useCollectionNicknameManagementDialogs";
import { normalizeCollectionNicknameIds } from "@/pages/collection-nicknames/utils";
import { parseApiError } from "@/pages/collection/utils";

type UseCollectionNicknameManagementActionsOptions = {
  nicknameData: CollectionNicknameManagementDataValue;
  dialogs: CollectionNicknameManagementDialogsValue;
  onNicknameListChanged?: () => void;
};

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

export function useCollectionNicknameManagementActions({
  nicknameData,
  dialogs,
  onNicknameListChanged,
}: UseCollectionNicknameManagementActionsOptions): UseCollectionNicknameManagementActionsValue {
  const { toast } = useToast();
  const [savingAssignment, setSavingAssignment] = useState(false);

  // In-flight refs guard against the React closure race where two rapid clicks
  // both read the state flag as false before the first state update is committed.
  const saveAssignmentRef = useRef(false);
  const createGroupRef = useRef(false);
  const saveLeaderRef = useRef(false);
  const confirmDeleteGroupRef = useRef(false);
  const createNicknameRef = useRef(false);
  const saveEditNicknameRef = useRef(false);
  const confirmResetPasswordRef = useRef(false);
  const confirmUngroupRef = useRef(false);

  const saveAssignment = async () => {
    if (!nicknameData.selectedGroup || savingAssignment || saveAssignmentRef.current) return;
    saveAssignmentRef.current = true;
    setSavingAssignment(true);
    try {
      const leaderId = nicknameData.selectedGroup.leaderNicknameId || "";
      const nextMembers = normalizeCollectionNicknameIds(
        nicknameData.assignedIds.filter(
          (id) => id !== leaderId && nicknameData.nicknameById.has(id),
        ),
      );
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
      const nextMembers = normalizeCollectionNicknameIds(
        nicknameData.assignedIds.filter(
          (id) => id !== dialogs.changeLeaderId && nicknameData.nicknameById.has(id),
        ),
      );
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

  const createNickname = async () => {
    if (dialogs.addingNickname || createNicknameRef.current) return;
    const nickname = dialogs.newNickname.trim();
    if (nickname.length < 2) {
      toast({
        title: "Validation Error",
        description: "Nickname mesti sekurang-kurangnya 2 aksara.",
        variant: "destructive",
      });
      return;
    }
    createNicknameRef.current = true;
    dialogs.setAddingNickname(true);
    try {
      await createCollectionNickname({ nickname, roleScope: dialogs.newRoleScope });
      dialogs.setNewNickname("");
      dialogs.setNewRoleScope("both");
      dialogs.setAddOpen(false);
      toast({
        title: "Nickname Created",
        description: "Nickname baru berjaya ditambah.",
      });
      await nicknameData.reloadData();
      onNicknameListChanged?.();
    } catch (error: unknown) {
      toast({
        title: "Failed to Create Nickname",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      createNicknameRef.current = false;
      dialogs.setAddingNickname(false);
    }
  };

  const saveEditNickname = async () => {
    if (!dialogs.editingNickname || dialogs.savingEdit || saveEditNicknameRef.current) return;
    const nickname = dialogs.editValue.trim();
    if (nickname.length < 2) {
      toast({
        title: "Validation Error",
        description: "Nickname mesti sekurang-kurangnya 2 aksara.",
        variant: "destructive",
      });
      return;
    }
    saveEditNicknameRef.current = true;
    dialogs.setSavingEdit(true);
    try {
      await updateCollectionNickname(dialogs.editingNickname.id, {
        nickname,
        roleScope: dialogs.editRoleScope,
      });
      dialogs.setEditingNickname(null);
      toast({
        title: "Nickname Updated",
        description: "Nickname berjaya dikemaskini.",
      });
      await nicknameData.reloadData();
      onNicknameListChanged?.();
    } catch (error: unknown) {
      toast({
        title: "Failed to Update Nickname",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      saveEditNicknameRef.current = false;
      dialogs.setSavingEdit(false);
    }
  };

  const updateStatus = async (item: CollectionStaffNickname, isActive: boolean) => {
    if (dialogs.statusBusyId) return;
    dialogs.setStatusBusyId(item.id);
    try {
      await setCollectionNicknameStatus(item.id, isActive);
      toast({
        title: isActive ? "Nickname Activated" : "Nickname Deactivated",
        description: item.nickname,
      });
      await nicknameData.reloadData();
      onNicknameListChanged?.();
      dialogs.setPendingDeactivate(null);
    } catch (error: unknown) {
      toast({
        title: "Failed to Update Status",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      dialogs.setStatusBusyId(null);
    }
  };

  const deleteNickname = async () => {
    if (!dialogs.pendingDeleteNickname || dialogs.deletingNicknameId) return;
    const target = dialogs.pendingDeleteNickname;
    dialogs.setDeletingNicknameId(target.id);
    try {
      await deleteCollectionNickname(target.id);
      dialogs.setPendingDeleteNickname(null);
      toast({
        title: "Nickname Updated",
        description: `${target.nickname} berjaya diproses.`,
      });
      await nicknameData.reloadData();
      onNicknameListChanged?.();
    } catch (error: unknown) {
      toast({
        title: "Failed to Delete Nickname",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      dialogs.setDeletingNicknameId(null);
    }
  };

  const confirmResetPassword = async () => {
    if (!dialogs.pendingResetPassword || dialogs.resettingNicknameId || confirmResetPasswordRef.current) return;
    const target = dialogs.pendingResetPassword;
    confirmResetPasswordRef.current = true;
    dialogs.setResettingNicknameId(target.id);
    try {
      const response = await resetCollectionNicknamePassword(target.id);
      const temporaryPassword = String(response?.temporaryPassword || "").trim();
      dialogs.setPendingResetPassword(null);
      toast({
        title: "Password Nickname Direset",
        description: temporaryPassword
          ? `${target.nickname} telah direset. Password sementara: ${temporaryPassword}. Pengguna perlu login menggunakan password ini dan terus tetapkan password baharu.`
          : `${target.nickname} telah direset. Gunakan password sementara semasa yang ditetapkan oleh sistem dan tetapkan password baharu selepas login.`,
      });
    } catch (error: unknown) {
      toast({
        title: "Failed to Reset Password",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      confirmResetPasswordRef.current = false;
      dialogs.setResettingNicknameId(null);
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
    createNickname,
    saveEditNickname,
    updateStatus,
    deleteNickname,
    confirmResetPassword,
    confirmUngroup,
  };
}

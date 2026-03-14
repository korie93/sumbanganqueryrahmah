import { memo, useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  createCollectionAdminGroup,
  createCollectionNickname,
  deleteCollectionAdminGroup,
  deleteCollectionNickname,
  getCollectionAdminGroups,
  getCollectionNicknames,
  resetCollectionNicknamePassword,
  setCollectionNicknameStatus,
  type CollectionAdminGroup,
  type CollectionStaffNickname,
  updateCollectionAdminGroup,
  updateCollectionNickname,
} from "@/lib/api";
import { CollectionNicknameDialogs } from "@/pages/collection-nicknames/CollectionNicknameDialogs";
import { GroupListPanel } from "@/pages/collection-nicknames/GroupListPanel";
import { NicknameAssignmentPanel } from "@/pages/collection-nicknames/NicknameAssignmentPanel";
import {
  normalizeCollectionNicknameIds,
  sameCollectionNicknameIds,
  sortLeaderOptions,
  type PendingUngroup,
} from "@/pages/collection-nicknames/utils";
import { parseApiError } from "./utils";

type Props = {
  role: string;
  currentNickname: string;
  onNicknameListChanged?: () => void;
};

function ManageCollectionNicknamesPage({
  role,
  currentNickname,
  onNicknameListChanged,
}: Props) {
  const { toast } = useToast();
  const isSuperuser = role === "superuser";

  const [groups, setGroups] = useState<CollectionAdminGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [expandedGroupIds, setExpandedGroupIds] = useState<string[]>([]);
  const [groupSearch, setGroupSearch] = useState("");
  const [loadingGroups, setLoadingGroups] = useState(false);

  const [nicknames, setNicknames] = useState<CollectionStaffNickname[]>([]);
  const [nicknameSearch, setNicknameSearch] = useState("");
  const [loadingNicknames, setLoadingNicknames] = useState(false);

  const [assignedIds, setAssignedIds] = useState<string[]>([]);
  const [savedAssignedIds, setSavedAssignedIds] = useState<string[]>([]);
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [pendingGroupSwitchId, setPendingGroupSwitchId] = useState<string | null>(null);
  const [confirmSwitchOpen, setConfirmSwitchOpen] = useState(false);

  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [createLeaderId, setCreateLeaderId] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [changeLeaderOpen, setChangeLeaderOpen] = useState(false);
  const [changeLeaderId, setChangeLeaderId] = useState("");
  const [savingLeader, setSavingLeader] = useState(false);
  const [pendingDeleteGroup, setPendingDeleteGroup] =
    useState<CollectionAdminGroup | null>(null);
  const [deletingGroup, setDeletingGroup] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [newNickname, setNewNickname] = useState("");
  const [newRoleScope, setNewRoleScope] = useState<"admin" | "user" | "both">("both");
  const [addingNickname, setAddingNickname] = useState(false);
  const [editingNickname, setEditingNickname] =
    useState<CollectionStaffNickname | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editRoleScope, setEditRoleScope] = useState<"admin" | "user" | "both">("both");
  const [savingEdit, setSavingEdit] = useState(false);
  const [pendingDeactivate, setPendingDeactivate] =
    useState<CollectionStaffNickname | null>(null);
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);
  const [pendingDeleteNickname, setPendingDeleteNickname] =
    useState<CollectionStaffNickname | null>(null);
  const [deletingNicknameId, setDeletingNicknameId] = useState<string | null>(null);
  const [pendingResetPassword, setPendingResetPassword] =
    useState<CollectionStaffNickname | null>(null);
  const [resettingNicknameId, setResettingNicknameId] = useState<string | null>(null);
  const [pendingUngroup, setPendingUngroup] = useState<PendingUngroup | null>(null);
  const [ungrouping, setUngrouping] = useState(false);

  const deferredGroupSearch = useDeferredValue(groupSearch);
  const deferredNicknameSearch = useDeferredValue(nicknameSearch);

  const selectedGroup = useMemo(
    () => groups.find((group) => group.id === selectedGroupId) || null,
    [groups, selectedGroupId],
  );

  const nicknameById = useMemo(
    () => new Map(nicknames.map((nickname) => [nickname.id, nickname])),
    [nicknames],
  );

  const nicknameIdByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const nickname of nicknames) {
      const key = nickname.nickname.trim().toLowerCase();
      if (key && !map.has(key)) map.set(key, nickname.id);
    }
    return map;
  }, [nicknames]);

  const leaderOptions = useMemo(() => sortLeaderOptions(nicknames), [nicknames]);

  const filteredGroups = useMemo(() => {
    const query = deferredGroupSearch.trim().toLowerCase();
    if (!query) return groups;
    return groups.filter(
      (group) =>
        group.leaderNickname.toLowerCase().includes(query) ||
        group.memberNicknames.some((member) => member.toLowerCase().includes(query)),
    );
  }, [deferredGroupSearch, groups]);

  const filteredNicknames = useMemo(() => {
    const query = deferredNicknameSearch.trim().toLowerCase();
    if (!query) return nicknames;
    return nicknames.filter((nickname) =>
      nickname.nickname.toLowerCase().includes(query),
    );
  }, [deferredNicknameSearch, nicknames]);

  const activeAvailable = useMemo(
    () => nicknames.filter((nickname) => nickname.isActive).length,
    [nicknames],
  );

  const assignedActive = useMemo(
    () => assignedIds.filter((id) => nicknameById.get(id)?.isActive).length,
    [assignedIds, nicknameById],
  );

  const unsaved = useMemo(
    () => !sameCollectionNicknameIds(assignedIds, savedAssignedIds),
    [assignedIds, savedAssignedIds],
  );

  const loadGroups = useCallback(async () => {
    if (!isSuperuser) return;
    setLoadingGroups(true);
    try {
      const response = await getCollectionAdminGroups();
      const rows = Array.isArray(response?.groups) ? response.groups : [];
      setGroups(rows);
      setSelectedGroupId((previous) =>
        previous && rows.some((row) => row.id === previous) ? previous : rows[0]?.id || "",
      );
    } catch (error: unknown) {
      toast({
        title: "Failed to Load Admin Groups",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      setLoadingGroups(false);
    }
  }, [isSuperuser, toast]);

  const loadNicknames = useCallback(async () => {
    if (!isSuperuser) return;
    setLoadingNicknames(true);
    try {
      const response = await getCollectionNicknames({ includeInactive: true });
      setNicknames(Array.isArray(response?.nicknames) ? response.nicknames : []);
    } catch (error: unknown) {
      toast({
        title: "Failed to Load Nicknames",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      setLoadingNicknames(false);
    }
  }, [isSuperuser, toast]);

  const reloadData = useCallback(async () => {
    await Promise.all([loadGroups(), loadNicknames()]);
  }, [loadGroups, loadNicknames]);

  useEffect(() => {
    void reloadData();
  }, [reloadData]);

  useEffect(() => {
    const group = groups.find((item) => item.id === selectedGroupId);
    const ids = normalizeCollectionNicknameIds(group?.memberNicknameIds || []);
    setAssignedIds(ids);
    setSavedAssignedIds(ids);
  }, [groups, selectedGroupId]);

  useEffect(() => {
    if (!selectedGroupId) return;
    setExpandedGroupIds((previous) =>
      previous.includes(selectedGroupId) ? previous : [selectedGroupId, ...previous],
    );
  }, [selectedGroupId]);

  if (!isSuperuser) {
    return (
      <Card className="border-border/60 bg-background/70">
        <CardHeader>
          <CardTitle className="text-xl">Manage Nickname</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Hanya superuser dibenarkan mengurus admin nickname groups.
          </p>
        </CardContent>
      </Card>
    );
  }

  const trySelectGroup = (groupId: string) => {
    if (!groupId || groupId === selectedGroupId) return;
    if (unsaved) {
      setPendingGroupSwitchId(groupId);
      setConfirmSwitchOpen(true);
      return;
    }
    setSelectedGroupId(groupId);
  };

  const toggleExpandGroup = (groupId: string) => {
    setExpandedGroupIds((previous) =>
      previous.includes(groupId)
        ? previous.filter((id) => id !== groupId)
        : [...previous, groupId],
    );
  };

  const toggleAssigned = (nicknameId: string, checked: boolean) => {
    setAssignedIds((previous) =>
      checked
        ? normalizeCollectionNicknameIds([...previous, nicknameId])
        : previous.filter((id) => id !== nicknameId),
    );
  };

  const selectAll = () => {
    if (!selectedGroup) return;
    const leaderId = selectedGroup.leaderNicknameId || "";
    const selectableIds = filteredNicknames
      .filter((nickname) => nickname.isActive && nickname.id !== leaderId)
      .map((nickname) => nickname.id);
    setAssignedIds((previous) =>
      normalizeCollectionNicknameIds([...previous, ...selectableIds]),
    );
  };

  const clearAll = () => setAssignedIds([]);

  const saveAssignment = async () => {
    if (!selectedGroup || savingAssignment) return;
    setSavingAssignment(true);
    try {
      const leaderId = selectedGroup.leaderNicknameId || "";
      const nextMembers = normalizeCollectionNicknameIds(
        assignedIds.filter((id) => id !== leaderId && nicknameById.has(id)),
      );
      const response = await updateCollectionAdminGroup(selectedGroup.id, {
        memberNicknameIds: nextMembers,
      });
      const updated = response?.group;
      if (updated) {
        setGroups((previous) =>
          previous.map((group) => (group.id === updated.id ? updated : group)),
        );
        const saved = normalizeCollectionNicknameIds(updated.memberNicknameIds || []);
        setAssignedIds(saved);
        setSavedAssignedIds(saved);
      }
      toast({
        title: "Assignment Saved",
        description: `Assignment untuk ${selectedGroup.leaderNickname} berjaya disimpan.`,
      });
    } catch (error: unknown) {
      toast({
        title: "Failed to Save Assignment",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      setSavingAssignment(false);
    }
  };

  const createGroup = async () => {
    if (!createLeaderId || creatingGroup) return;
    setCreatingGroup(true);
    try {
      const response = await createCollectionAdminGroup({
        leaderNicknameId: createLeaderId,
        memberNicknameIds: [],
      });
      setCreateGroupOpen(false);
      setCreateLeaderId("");
      toast({
        title: "Admin Group Created",
        description: "Group admin berjaya ditambah.",
      });
      await reloadData();
      onNicknameListChanged?.();
      if (response?.group?.id) setSelectedGroupId(response.group.id);
    } catch (error: unknown) {
      toast({
        title: "Failed to Create Group",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      setCreatingGroup(false);
    }
  };

  const openChangeLeader = () => {
    if (!selectedGroup) return;
    setChangeLeaderId(selectedGroup.leaderNicknameId || "");
    setChangeLeaderOpen(true);
  };

  const saveLeader = async () => {
    if (!selectedGroup || !changeLeaderId || savingLeader) return;
    setSavingLeader(true);
    try {
      const nextMembers = normalizeCollectionNicknameIds(
        assignedIds.filter((id) => id !== changeLeaderId && nicknameById.has(id)),
      );
      const response = await updateCollectionAdminGroup(selectedGroup.id, {
        leaderNicknameId: changeLeaderId,
        memberNicknameIds: nextMembers,
      });
      const updated = response?.group;
      if (updated) {
        setGroups((previous) =>
          previous.map((group) => (group.id === updated.id ? updated : group)),
        );
        const saved = normalizeCollectionNicknameIds(updated.memberNicknameIds || []);
        setAssignedIds(saved);
        setSavedAssignedIds(saved);
      }
      setChangeLeaderOpen(false);
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
      setSavingLeader(false);
    }
  };

  const confirmDeleteGroup = async () => {
    if (!pendingDeleteGroup || deletingGroup) return;
    setDeletingGroup(true);
    try {
      await deleteCollectionAdminGroup(pendingDeleteGroup.id);
      setPendingDeleteGroup(null);
      toast({
        title: "Group Deleted",
        description: "Admin nickname group berjaya dipadam.",
      });
      await reloadData();
      onNicknameListChanged?.();
    } catch (error: unknown) {
      toast({
        title: "Failed to Delete Group",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      setDeletingGroup(false);
    }
  };

  const createNickname = async () => {
    const nickname = newNickname.trim();
    if (nickname.length < 2) {
      toast({
        title: "Validation Error",
        description: "Nickname mesti sekurang-kurangnya 2 aksara.",
        variant: "destructive",
      });
      return;
    }
    setAddingNickname(true);
    try {
      await createCollectionNickname({ nickname, roleScope: newRoleScope });
      setNewNickname("");
      setNewRoleScope("both");
      setAddOpen(false);
      toast({
        title: "Nickname Created",
        description: "Nickname baru berjaya ditambah.",
      });
      await reloadData();
      onNicknameListChanged?.();
    } catch (error: unknown) {
      toast({
        title: "Failed to Create Nickname",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      setAddingNickname(false);
    }
  };

  const saveEditNickname = async () => {
    if (!editingNickname || savingEdit) return;
    const nickname = editValue.trim();
    if (nickname.length < 2) {
      toast({
        title: "Validation Error",
        description: "Nickname mesti sekurang-kurangnya 2 aksara.",
        variant: "destructive",
      });
      return;
    }
    setSavingEdit(true);
    try {
      await updateCollectionNickname(editingNickname.id, {
        nickname,
        roleScope: editRoleScope,
      });
      setEditingNickname(null);
      toast({
        title: "Nickname Updated",
        description: "Nickname berjaya dikemaskini.",
      });
      await reloadData();
      onNicknameListChanged?.();
    } catch (error: unknown) {
      toast({
        title: "Failed to Update Nickname",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      setSavingEdit(false);
    }
  };

  const updateStatus = async (item: CollectionStaffNickname, isActive: boolean) => {
    if (statusBusyId) return;
    setStatusBusyId(item.id);
    try {
      await setCollectionNicknameStatus(item.id, isActive);
      toast({
        title: isActive ? "Nickname Activated" : "Nickname Deactivated",
        description: item.nickname,
      });
      await reloadData();
      onNicknameListChanged?.();
      setPendingDeactivate(null);
    } catch (error: unknown) {
      toast({
        title: "Failed to Update Status",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      setStatusBusyId(null);
    }
  };

  const deleteNickname = async () => {
    if (!pendingDeleteNickname || deletingNicknameId) return;
    const target = pendingDeleteNickname;
    setDeletingNicknameId(target.id);
    try {
      await deleteCollectionNickname(target.id);
      setPendingDeleteNickname(null);
      toast({
        title: "Nickname Updated",
        description: `${target.nickname} berjaya diproses.`,
      });
      await reloadData();
      onNicknameListChanged?.();
    } catch (error: unknown) {
      toast({
        title: "Failed to Delete Nickname",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      setDeletingNicknameId(null);
    }
  };

  const confirmResetPassword = async () => {
    if (!pendingResetPassword || resettingNicknameId) return;
    const target = pendingResetPassword;
    setResettingNicknameId(target.id);
    try {
      await resetCollectionNicknamePassword(target.id);
      setPendingResetPassword(null);
      toast({
        title: "Password Nickname Direset",
        description: `${target.nickname} telah direset. Password sementara: 12345678a`,
      });
    } catch (error: unknown) {
      toast({
        title: "Failed to Reset Password",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      setResettingNicknameId(null);
    }
  };

  const confirmUngroup = async () => {
    if (!pendingUngroup || ungrouping) return;
    const group = groups.find((item) => item.id === pendingUngroup.groupId);
    if (!group) {
      setPendingUngroup(null);
      return;
    }
    setUngrouping(true);
    try {
      const nextMembers = normalizeCollectionNicknameIds(
        (group.memberNicknameIds || []).filter(
          (id) => id !== pendingUngroup.nicknameId,
        ),
      );
      const response = await updateCollectionAdminGroup(group.id, {
        memberNicknameIds: nextMembers,
      });
      const updated = response?.group;
      if (updated) {
        setGroups((previous) =>
          previous.map((item) => (item.id === updated.id ? updated : item)),
        );
      }
      setPendingUngroup(null);
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
      setUngrouping(false);
    }
  };

  const handleConfirmedGroupSwitch = () => {
    const nextGroupId = pendingGroupSwitchId;
    setPendingGroupSwitchId(null);
    setConfirmSwitchOpen(false);
    if (nextGroupId) setSelectedGroupId(nextGroupId);
  };

  return (
    <>
      <Card className="border-border/60 bg-background/70">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl">Manage Nickname</CardTitle>
          <p className="text-xs text-muted-foreground">
            Total nickname: {nicknames.length} | Active: {activeAvailable}
            {currentNickname ? ` | Staff semasa: ${currentNickname}` : ""}
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <GroupListPanel
            loadingGroups={loadingGroups}
            filteredGroups={filteredGroups}
            expandedGroupIds={expandedGroupIds}
            selectedGroupId={selectedGroupId}
            groupSearch={groupSearch}
            nicknameIdByName={nicknameIdByName}
            onGroupSearchChange={setGroupSearch}
            onToggleExpandGroup={toggleExpandGroup}
            onSelectGroup={trySelectGroup}
            onUngroup={(groupId, nicknameId) =>
              setPendingUngroup({ groupId, nicknameId })
            }
          />

          <NicknameAssignmentPanel
            selectedGroup={selectedGroup}
            selectedGroupId={selectedGroupId}
            assignedActive={assignedActive}
            activeAvailable={activeAvailable}
            unsaved={unsaved}
            nicknameSearch={nicknameSearch}
            loadingNicknames={loadingNicknames}
            filteredNicknames={filteredNicknames}
            assignedIds={assignedIds}
            savingAssignment={savingAssignment}
            statusBusyId={statusBusyId}
            resettingNicknameId={resettingNicknameId}
            deletingNicknameId={deletingNicknameId}
            onNicknameSearchChange={setNicknameSearch}
            onOpenCreateGroup={() => setCreateGroupOpen(true)}
            onOpenChangeLeader={openChangeLeader}
            onDeleteSelectedGroup={() => selectedGroup && setPendingDeleteGroup(selectedGroup)}
            onOpenAddNickname={() => setAddOpen(true)}
            onSelectAll={selectAll}
            onClearAll={clearAll}
            onSaveAssignment={() => void saveAssignment()}
            onToggleAssigned={toggleAssigned}
            onEditNickname={(item) => {
              setEditingNickname(item);
              setEditValue(item.nickname);
              setEditRoleScope(item.roleScope || "both");
            }}
            onDeactivateNickname={setPendingDeactivate}
            onActivateNickname={(item) => void updateStatus(item, true)}
            onResetNicknamePassword={setPendingResetPassword}
            onDeleteNickname={setPendingDeleteNickname}
          />
        </CardContent>
      </Card>

      <CollectionNicknameDialogs
        leaderOptions={leaderOptions}
        createGroupOpen={createGroupOpen}
        createLeaderId={createLeaderId}
        creatingGroup={creatingGroup}
        changeLeaderOpen={changeLeaderOpen}
        changeLeaderId={changeLeaderId}
        savingLeader={savingLeader}
        addOpen={addOpen}
        newNickname={newNickname}
        newRoleScope={newRoleScope}
        addingNickname={addingNickname}
        editingNickname={editingNickname}
        editValue={editValue}
        editRoleScope={editRoleScope}
        savingEdit={savingEdit}
        pendingDeactivate={pendingDeactivate}
        statusBusyId={statusBusyId}
        pendingDeleteGroup={pendingDeleteGroup}
        deletingGroup={deletingGroup}
        pendingDeleteNickname={pendingDeleteNickname}
        deletingNicknameId={deletingNicknameId}
        pendingResetPassword={pendingResetPassword}
        resettingNicknameId={resettingNicknameId}
        pendingUngroup={pendingUngroup}
        ungrouping={ungrouping}
        confirmSwitchOpen={confirmSwitchOpen}
        onCreateGroupOpenChange={setCreateGroupOpen}
        onCreateLeaderIdChange={setCreateLeaderId}
        onCreateGroup={() => void createGroup()}
        onChangeLeaderOpenChange={setChangeLeaderOpen}
        onChangeLeaderIdChange={setChangeLeaderId}
        onSaveLeader={() => void saveLeader()}
        onAddOpenChange={setAddOpen}
        onNewNicknameChange={setNewNickname}
        onNewRoleScopeChange={setNewRoleScope}
        onCreateNickname={() => void createNickname()}
        onEditingNicknameOpenChange={(open) => {
          if (!open) setEditingNickname(null);
        }}
        onEditValueChange={setEditValue}
        onEditRoleScopeChange={setEditRoleScope}
        onSaveEditNickname={() => void saveEditNickname()}
        onPendingDeactivateOpenChange={(open) => {
          if (!open) setPendingDeactivate(null);
        }}
        onConfirmDeactivate={() => pendingDeactivate && void updateStatus(pendingDeactivate, false)}
        onPendingDeleteGroupOpenChange={(open) => {
          if (!open) setPendingDeleteGroup(null);
        }}
        onConfirmDeleteGroup={() => void confirmDeleteGroup()}
        onPendingDeleteNicknameOpenChange={(open) => {
          if (!open) setPendingDeleteNickname(null);
        }}
        onConfirmDeleteNickname={() => void deleteNickname()}
        onPendingResetPasswordOpenChange={(open) => {
          if (!open) setPendingResetPassword(null);
        }}
        onConfirmResetPassword={() => void confirmResetPassword()}
        onPendingUngroupOpenChange={(open) => {
          if (!open) setPendingUngroup(null);
        }}
        onConfirmUngroup={() => void confirmUngroup()}
        onConfirmSwitchOpenChange={(open) => {
          if (!open) setConfirmSwitchOpen(false);
        }}
        onConfirmSwitch={handleConfirmedGroupSwitch}
      />
    </>
  );
}

const MemoizedManageCollectionNicknamesPage = memo(ManageCollectionNicknamesPage);
MemoizedManageCollectionNicknamesPage.displayName = "ManageCollectionNicknamesPage";

export default MemoizedManageCollectionNicknamesPage;

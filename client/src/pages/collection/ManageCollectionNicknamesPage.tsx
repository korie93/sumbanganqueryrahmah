import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  createCollectionAdminGroup,
  createCollectionNickname,
  deleteCollectionAdminGroup,
  deleteCollectionNickname,
  getCollectionAdminGroups,
  getCollectionNicknames,
  setCollectionNicknameStatus,
  type CollectionAdminGroup,
  type CollectionStaffNickname,
  updateCollectionAdminGroup,
  updateCollectionNickname,
} from "@/lib/api";
import { parseApiError } from "./utils";

type Props = {
  role: string;
  currentNickname: string;
  onNicknameListChanged?: () => void;
};

type PendingUngroup = {
  groupId: string;
  nicknameId: string;
};

const ROLE_SCOPE_OPTIONS: Array<{ value: "admin" | "user" | "both"; label: string }> = [
  { value: "admin", label: "Admin" },
  { value: "user", label: "User" },
  { value: "both", label: "Admin + User" },
];

const normalizeIds = (ids: string[]) =>
  Array.from(new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));

const sameIds = (left: string[], right: string[]) => {
  const a = normalizeIds(left);
  const b = normalizeIds(right);
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
};

const scopeLabel = (scope: string) => (scope === "admin" ? "Admin" : scope === "user" ? "User" : "Admin + User");

export default function ManageCollectionNicknamesPage({ role, currentNickname, onNicknameListChanged }: Props) {
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
  const [pendingDeleteGroup, setPendingDeleteGroup] = useState<CollectionAdminGroup | null>(null);
  const [deletingGroup, setDeletingGroup] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [newNickname, setNewNickname] = useState("");
  const [newRoleScope, setNewRoleScope] = useState<"admin" | "user" | "both">("both");
  const [addingNickname, setAddingNickname] = useState(false);
  const [editingNickname, setEditingNickname] = useState<CollectionStaffNickname | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editRoleScope, setEditRoleScope] = useState<"admin" | "user" | "both">("both");
  const [savingEdit, setSavingEdit] = useState(false);
  const [pendingDeactivate, setPendingDeactivate] = useState<CollectionStaffNickname | null>(null);
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);
  const [pendingDeleteNickname, setPendingDeleteNickname] = useState<CollectionStaffNickname | null>(null);
  const [deletingNicknameId, setDeletingNicknameId] = useState<string | null>(null);
  const [pendingUngroup, setPendingUngroup] = useState<PendingUngroup | null>(null);
  const [ungrouping, setUngrouping] = useState(false);

  const selectedGroup = useMemo(() => groups.find((g) => g.id === selectedGroupId) || null, [groups, selectedGroupId]);
  const nicknameById = useMemo(() => new Map(nicknames.map((n) => [n.id, n])), [nicknames]);
  const nicknameIdByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const n of nicknames) {
      const key = n.nickname.trim().toLowerCase();
      if (key && !map.has(key)) map.set(key, n.id);
    }
    return map;
  }, [nicknames]);

  const leaderOptions = useMemo(
    () =>
      nicknames
        .filter((n) => n.isActive && (n.roleScope === "admin" || n.roleScope === "both"))
        .sort((a, b) => a.nickname.localeCompare(b.nickname, undefined, { sensitivity: "base" })),
    [nicknames],
  );

  const filteredGroups = useMemo(() => {
    const q = groupSearch.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => g.leaderNickname.toLowerCase().includes(q) || g.memberNicknames.some((m) => m.toLowerCase().includes(q)));
  }, [groupSearch, groups]);

  const filteredNicknames = useMemo(() => {
    const q = nicknameSearch.trim().toLowerCase();
    if (!q) return nicknames;
    return nicknames.filter((n) => n.nickname.toLowerCase().includes(q));
  }, [nicknameSearch, nicknames]);

  const activeAvailable = useMemo(() => nicknames.filter((n) => n.isActive).length, [nicknames]);
  const assignedActive = useMemo(() => assignedIds.filter((id) => nicknameById.get(id)?.isActive).length, [assignedIds, nicknameById]);
  const unsaved = useMemo(() => !sameIds(assignedIds, savedAssignedIds), [assignedIds, savedAssignedIds]);

  const loadGroups = useCallback(async () => {
    if (!isSuperuser) return;
    setLoadingGroups(true);
    try {
      const res = await getCollectionAdminGroups();
      const rows = Array.isArray(res?.groups) ? res.groups : [];
      setGroups(rows);
      setSelectedGroupId((prev) => (prev && rows.some((r) => r.id === prev) ? prev : rows[0]?.id || ""));
    } catch (error: unknown) {
      toast({ title: "Failed to Load Admin Groups", description: parseApiError(error), variant: "destructive" });
    } finally {
      setLoadingGroups(false);
    }
  }, [isSuperuser, toast]);

  const loadNicknames = useCallback(async () => {
    if (!isSuperuser) return;
    setLoadingNicknames(true);
    try {
      const res = await getCollectionNicknames({ includeInactive: true });
      setNicknames(Array.isArray(res?.nicknames) ? res.nicknames : []);
    } catch (error: unknown) {
      toast({ title: "Failed to Load Nicknames", description: parseApiError(error), variant: "destructive" });
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
    const group = groups.find((g) => g.id === selectedGroupId);
    const ids = normalizeIds(group?.memberNicknameIds || []);
    setAssignedIds(ids);
    setSavedAssignedIds(ids);
  }, [groups, selectedGroupId]);

  useEffect(() => {
    if (!selectedGroupId) return;
    setExpandedGroupIds((prev) => (prev.includes(selectedGroupId) ? prev : [selectedGroupId, ...prev]));
  }, [selectedGroupId]);

  if (!isSuperuser) {
    return (
      <Card className="border-border/60 bg-background/70">
        <CardHeader><CardTitle className="text-xl">Manage Nickname</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Hanya superuser dibenarkan mengurus admin nickname groups.</p>
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
    setExpandedGroupIds((prev) => (prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]));
  };

  const toggleAssigned = (nicknameId: string, checked: boolean) => {
    setAssignedIds((prev) => (checked ? normalizeIds([...prev, nicknameId]) : prev.filter((id) => id !== nicknameId)));
  };

  const selectAll = () => {
    if (!selectedGroup) return;
    const leaderId = selectedGroup.leaderNicknameId || "";
    const selectable = filteredNicknames.filter((n) => n.isActive && n.id !== leaderId).map((n) => n.id);
    setAssignedIds((prev) => normalizeIds([...prev, ...selectable]));
  };

  const clearAll = () => setAssignedIds([]);

  const saveAssignment = async () => {
    if (!selectedGroup || savingAssignment) return;
    setSavingAssignment(true);
    try {
      const leaderId = selectedGroup.leaderNicknameId || "";
      const nextMembers = normalizeIds(assignedIds.filter((id) => id !== leaderId && nicknameById.has(id)));
      const res = await updateCollectionAdminGroup(selectedGroup.id, { memberNicknameIds: nextMembers });
      const updated = res?.group;
      if (updated) {
        setGroups((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
        const saved = normalizeIds(updated.memberNicknameIds || []);
        setAssignedIds(saved);
        setSavedAssignedIds(saved);
      }
      toast({ title: "Assignment Saved", description: `Assignment untuk ${selectedGroup.leaderNickname} berjaya disimpan.` });
    } catch (error: unknown) {
      toast({ title: "Failed to Save Assignment", description: parseApiError(error), variant: "destructive" });
    } finally {
      setSavingAssignment(false);
    }
  };

  const createGroup = async () => {
    if (!createLeaderId || creatingGroup) return;
    setCreatingGroup(true);
    try {
      const res = await createCollectionAdminGroup({ leaderNicknameId: createLeaderId, memberNicknameIds: [] });
      setCreateGroupOpen(false);
      setCreateLeaderId("");
      toast({ title: "Admin Group Created", description: "Group admin berjaya ditambah." });
      await reloadData();
      onNicknameListChanged?.();
      if (res?.group?.id) setSelectedGroupId(res.group.id);
    } catch (error: unknown) {
      toast({ title: "Failed to Create Group", description: parseApiError(error), variant: "destructive" });
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
      const nextMembers = normalizeIds(assignedIds.filter((id) => id !== changeLeaderId && nicknameById.has(id)));
      const res = await updateCollectionAdminGroup(selectedGroup.id, {
        leaderNicknameId: changeLeaderId,
        memberNicknameIds: nextMembers,
      });
      const updated = res?.group;
      if (updated) {
        setGroups((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
        const saved = normalizeIds(updated.memberNicknameIds || []);
        setAssignedIds(saved);
        setSavedAssignedIds(saved);
      }
      setChangeLeaderOpen(false);
      toast({ title: "Leader Updated", description: "Leader group berjaya dikemaskini." });
      onNicknameListChanged?.();
    } catch (error: unknown) {
      toast({ title: "Failed to Update Leader", description: parseApiError(error), variant: "destructive" });
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
      toast({ title: "Group Deleted", description: "Admin nickname group berjaya dipadam." });
      await reloadData();
      onNicknameListChanged?.();
    } catch (error: unknown) {
      toast({ title: "Failed to Delete Group", description: parseApiError(error), variant: "destructive" });
    } finally {
      setDeletingGroup(false);
    }
  };

  const createNickname = async () => {
    const nickname = newNickname.trim();
    if (nickname.length < 2) {
      toast({ title: "Validation Error", description: "Nickname mesti sekurang-kurangnya 2 aksara.", variant: "destructive" });
      return;
    }
    setAddingNickname(true);
    try {
      await createCollectionNickname({ nickname, roleScope: newRoleScope });
      setNewNickname("");
      setNewRoleScope("both");
      setAddOpen(false);
      toast({ title: "Nickname Created", description: "Nickname baru berjaya ditambah." });
      await reloadData();
      onNicknameListChanged?.();
    } catch (error: unknown) {
      toast({ title: "Failed to Create Nickname", description: parseApiError(error), variant: "destructive" });
    } finally {
      setAddingNickname(false);
    }
  };

  const saveEditNickname = async () => {
    if (!editingNickname || savingEdit) return;
    const nickname = editValue.trim();
    if (nickname.length < 2) {
      toast({ title: "Validation Error", description: "Nickname mesti sekurang-kurangnya 2 aksara.", variant: "destructive" });
      return;
    }
    setSavingEdit(true);
    try {
      await updateCollectionNickname(editingNickname.id, { nickname, roleScope: editRoleScope });
      setEditingNickname(null);
      toast({ title: "Nickname Updated", description: "Nickname berjaya dikemaskini." });
      await reloadData();
      onNicknameListChanged?.();
    } catch (error: unknown) {
      toast({ title: "Failed to Update Nickname", description: parseApiError(error), variant: "destructive" });
    } finally {
      setSavingEdit(false);
    }
  };

  const updateStatus = async (item: CollectionStaffNickname, isActive: boolean) => {
    if (statusBusyId) return;
    setStatusBusyId(item.id);
    try {
      await setCollectionNicknameStatus(item.id, isActive);
      toast({ title: isActive ? "Nickname Activated" : "Nickname Deactivated", description: item.nickname });
      await reloadData();
      onNicknameListChanged?.();
      setPendingDeactivate(null);
    } catch (error: unknown) {
      toast({ title: "Failed to Update Status", description: parseApiError(error), variant: "destructive" });
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
      toast({ title: "Nickname Updated", description: `${target.nickname} berjaya diproses.` });
      await reloadData();
      onNicknameListChanged?.();
    } catch (error: unknown) {
      toast({ title: "Failed to Delete Nickname", description: parseApiError(error), variant: "destructive" });
    } finally {
      setDeletingNicknameId(null);
    }
  };

  const confirmUngroup = async () => {
    if (!pendingUngroup || ungrouping) return;
    const group = groups.find((g) => g.id === pendingUngroup.groupId);
    if (!group) {
      setPendingUngroup(null);
      return;
    }
    setUngrouping(true);
    try {
      const nextMembers = normalizeIds((group.memberNicknameIds || []).filter((id) => id !== pendingUngroup.nicknameId));
      const res = await updateCollectionAdminGroup(group.id, { memberNicknameIds: nextMembers });
      const updated = res?.group;
      if (updated) {
        setGroups((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
      }
      setPendingUngroup(null);
      toast({ title: "Ungroup Berjaya", description: "Relationship grouping dibuang." });
    } catch (error: unknown) {
      toast({ title: "Failed to Ungroup", description: parseApiError(error), variant: "destructive" });
    } finally {
      setUngrouping(false);
    }
  };

  return (
    <>
      <Card className="border-border/60 bg-background/70">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl">Manage Nickname</CardTitle>
          <p className="text-xs text-muted-foreground">
            Total nickname: {nicknames.length} · Active: {activeAvailable}{currentNickname ? ` · Staff semasa: ${currentNickname}` : ""}
          </p>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className="rounded-md border border-border/60 bg-background/40 p-3">
            <div className="space-y-2">
              <Label>Admin Nickname Groups</Label>
              <Input value={groupSearch} onChange={(e) => setGroupSearch(e.target.value)} placeholder="Cari leader/member..." />
            </div>
            <div className="mt-3 max-h-[58vh] overflow-y-auto space-y-2 pr-1">
              {loadingGroups ? (
                <p className="text-sm text-muted-foreground">Loading groups...</p>
              ) : filteredGroups.length === 0 ? (
                <p className="text-sm text-muted-foreground">Tiada admin group ditemui.</p>
              ) : (
                filteredGroups.map((group) => {
                  const expanded = expandedGroupIds.includes(group.id);
                  const members = (group.memberNicknames || []).slice().sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
                  return (
                    <div key={group.id} className="rounded-md border border-border/60 bg-background/50">
                      <div className="flex items-center justify-between px-2 py-2">
                        <button type="button" className="inline-flex items-center gap-2 text-left" onClick={() => toggleExpandGroup(group.id)}>
                          <ChevronRight className={`h-4 w-4 transition ${expanded ? "rotate-90" : ""}`} />
                          <span className="text-sm font-medium">{group.leaderNickname}</span>
                        </button>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">{members.length}</Badge>
                          <Button size="sm" variant={selectedGroupId === group.id ? "default" : "outline"} onClick={() => trySelectGroup(group.id)}>Open</Button>
                        </div>
                      </div>
                      {expanded && (
                        <div className="border-t border-border/60 px-3 py-2 space-y-2">
                          {members.length === 0 ? (
                            <p className="text-xs text-muted-foreground">Tiada member dalam group ini.</p>
                          ) : (
                            members.map((memberNickname) => {
                              const nicknameId = nicknameIdByName.get(memberNickname.toLowerCase()) || "";
                              return (
                                <div key={`${group.id}-${memberNickname}`} className="flex items-center justify-between gap-2 text-sm">
                                  <span className="truncate">- {memberNickname}</span>
                                  <Button size="sm" variant="outline" onClick={() => nicknameId && setPendingUngroup({ groupId: group.id, nicknameId })} disabled={!nicknameId}>
                                    Ungroup
                                  </Button>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-md border border-border/60 bg-background/40 p-3">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div className="space-y-2">
                <p className="text-sm font-semibold">Nickname List / Assignment</p>
                <p className="text-xs text-muted-foreground">{selectedGroup ? `Group dipilih: ${selectedGroup.leaderNickname}` : "Pilih admin group dahulu."}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">Assigned: {assignedActive}</Badge>
                  <Badge variant="secondary">Active Available: {activeAvailable}</Badge>
                  {unsaved && <Badge variant="destructive">Unsaved changes</Badge>}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={() => setCreateGroupOpen(true)}>Tambah Group</Button>
                <Button variant="outline" onClick={openChangeLeader} disabled={!selectedGroup}>Tukar Leader</Button>
                <Button variant="destructive" onClick={() => selectedGroup && setPendingDeleteGroup(selectedGroup)} disabled={!selectedGroup}>Padam Group</Button>
                <Button variant="outline" onClick={() => setAddOpen(true)}>Tambah Nickname</Button>
              </div>
            </div>

            <div className="mb-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
              <Input value={nicknameSearch} onChange={(e) => setNicknameSearch(e.target.value)} placeholder="Cari nickname..." />
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={selectAll} disabled={!selectedGroupId}>Select All</Button>
                <Button variant="outline" onClick={clearAll} disabled={!selectedGroupId}>Clear All</Button>
                <Button onClick={() => void saveAssignment()} disabled={!selectedGroupId || savingAssignment || !unsaved}>
                  {savingAssignment ? "Saving..." : "Save Assignment"}
                </Button>
              </div>
            </div>

            <div className="max-h-[58vh] overflow-auto pr-1">
              {loadingNicknames ? (
                <div className="rounded-md border border-border/60 p-6 text-center text-sm text-muted-foreground">Loading nickname data...</div>
              ) : (
                <Table className="text-sm">
                  <TableHeader className="bg-background">
                    <TableRow>
                      <TableHead className="w-[86px]">Assign</TableHead>
                      <TableHead>Nickname</TableHead>
                      <TableHead>Role Scope</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredNicknames.map((item) => {
                      const isLeader = selectedGroup?.leaderNicknameId === item.id;
                      const checked = isLeader || assignedIds.includes(item.id);
                      return (
                        <TableRow key={item.id}>
                          <TableCell>{isLeader ? <Badge variant="outline">Leader</Badge> : <Checkbox checked={checked} onCheckedChange={(v) => toggleAssigned(item.id, Boolean(v))} disabled={!item.isActive || !selectedGroupId} />}</TableCell>
                          <TableCell className="font-medium">{item.nickname}</TableCell>
                          <TableCell><Badge variant="outline">{scopeLabel(item.roleScope)}</Badge></TableCell>
                          <TableCell><Badge variant={item.isActive ? "default" : "secondary"}>{item.isActive ? "Active" : "Inactive"}</Badge></TableCell>
                          <TableCell className="text-right">
                            <div className="inline-flex items-center gap-2">
                              <Button size="sm" variant="outline" onClick={() => { setEditingNickname(item); setEditValue(item.nickname); setEditRoleScope(item.roleScope || "both"); }}>Edit</Button>
                              {item.isActive ? (
                                <Button size="sm" variant="outline" onClick={() => setPendingDeactivate(item)} disabled={statusBusyId === item.id}>Nyahaktif</Button>
                              ) : (
                                <Button size="sm" variant="outline" onClick={() => void updateStatus(item, true)} disabled={statusBusyId === item.id}>Aktifkan</Button>
                              )}
                              <Button size="sm" variant="destructive" onClick={() => setPendingDeleteNickname(item)} disabled={deletingNicknameId === item.id}>Delete</Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={createGroupOpen} onOpenChange={setCreateGroupOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tambah Admin Group</DialogTitle>
            <DialogDescription>Pilih leader nickname untuk group admin baharu.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Leader Nickname</Label>
            <Select value={createLeaderId} onValueChange={setCreateLeaderId}>
              <SelectTrigger><SelectValue placeholder="Pilih leader nickname" /></SelectTrigger>
              <SelectContent>
                {leaderOptions.map((option) => <SelectItem key={option.id} value={option.id}>{option.nickname}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateGroupOpen(false)} disabled={creatingGroup}>Batal</Button>
            <Button onClick={() => void createGroup()} disabled={creatingGroup || !createLeaderId}>{creatingGroup ? "Saving..." : "Simpan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={changeLeaderOpen} onOpenChange={setChangeLeaderOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tukar Leader Group</DialogTitle>
            <DialogDescription>Leader nickname mesti unik dan bertaraf admin.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Leader Nickname</Label>
            <Select value={changeLeaderId} onValueChange={setChangeLeaderId}>
              <SelectTrigger><SelectValue placeholder="Pilih leader nickname" /></SelectTrigger>
              <SelectContent>
                {leaderOptions.map((option) => <SelectItem key={option.id} value={option.id}>{option.nickname}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangeLeaderOpen(false)} disabled={savingLeader}>Batal</Button>
            <Button onClick={() => void saveLeader()} disabled={savingLeader || !changeLeaderId}>{savingLeader ? "Saving..." : "Simpan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Tambah Nickname</DialogTitle>
            <DialogDescription>Tambah nickname rasmi baharu dan tetapkan role scope.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Nickname</Label>
            <Input value={newNickname} onChange={(e) => setNewNickname(e.target.value)} placeholder="Contoh: SW.HAIZAL_1131" maxLength={64} />
          </div>
          <div className="space-y-2">
            <Label>Role Scope</Label>
            <Select value={newRoleScope} onValueChange={(value) => setNewRoleScope(value as "admin" | "user" | "both")}>
              <SelectTrigger><SelectValue placeholder="Pilih role scope" /></SelectTrigger>
              <SelectContent>
                {ROLE_SCOPE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={addingNickname}>Batal</Button>
            <Button onClick={() => void createNickname()} disabled={addingNickname}>{addingNickname ? "Saving..." : "Simpan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editingNickname)} onOpenChange={(open) => !open && setEditingNickname(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Nickname</DialogTitle>
            <DialogDescription>Kemaskini nama nickname dan role scope akses nickname.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Nickname</Label>
            <Input value={editValue} onChange={(e) => setEditValue(e.target.value)} maxLength={64} />
          </div>
          <div className="space-y-2">
            <Label>Role Scope</Label>
            <Select value={editRoleScope} onValueChange={(value) => setEditRoleScope(value as "admin" | "user" | "both")}>
              <SelectTrigger><SelectValue placeholder="Pilih role scope" /></SelectTrigger>
              <SelectContent>
                {ROLE_SCOPE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingNickname(null)} disabled={savingEdit}>Batal</Button>
            <Button onClick={() => void saveEditNickname()} disabled={savingEdit}>{savingEdit ? "Saving..." : "Simpan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(pendingDeactivate)} onOpenChange={(open) => !open && setPendingDeactivate(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nyahaktif Nickname</DialogTitle>
            <DialogDescription>Adakah anda pasti mahu nyahaktif nickname ini?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDeactivate(null)}>Batal</Button>
            <Button variant="destructive" onClick={() => pendingDeactivate && void updateStatus(pendingDeactivate, false)} disabled={!pendingDeactivate || statusBusyId === pendingDeactivate.id}>
              {pendingDeactivate && statusBusyId === pendingDeactivate.id ? "Processing..." : "Nyahaktif"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(pendingDeleteGroup)} onOpenChange={(open) => !open && setPendingDeleteGroup(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Padam Admin Group</AlertDialogTitle>
            <AlertDialogDescription>Adakah anda pasti mahu padam group ini?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingGroup}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDeleteGroup()} disabled={deletingGroup}>{deletingGroup ? "Processing..." : "Padam"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(pendingDeleteNickname)} onOpenChange={(open) => !open && setPendingDeleteNickname(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Padam Nickname</AlertDialogTitle>
            <AlertDialogDescription>Jika nickname sedang digunakan, sistem akan nyahaktifkan secara selamat.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(deletingNicknameId)}>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => void deleteNickname()} disabled={!pendingDeleteNickname || Boolean(deletingNicknameId)}>
              {deletingNicknameId ? "Processing..." : "Padam"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={Boolean(pendingUngroup)} onOpenChange={(open) => !open && setPendingUngroup(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ungroup Nickname</AlertDialogTitle>
            <AlertDialogDescription>Adakah anda pasti mahu buang nickname ini daripada grouping admin ini?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmUngroup()} disabled={ungrouping}>{ungrouping ? "Processing..." : "Buang"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmSwitchOpen} onOpenChange={(open) => !open && setConfirmSwitchOpen(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Perubahan Belum Disimpan</AlertDialogTitle>
            <AlertDialogDescription>Perubahan belum disimpan. Adakah anda mahu teruskan tanpa simpan?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={() => { const next = pendingGroupSwitchId; setPendingGroupSwitchId(null); setConfirmSwitchOpen(false); if (next) setSelectedGroupId(next); }}>
              Teruskan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

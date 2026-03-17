import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  getCollectionAdminGroups,
  getCollectionNicknames,
  type CollectionAdminGroup,
  type CollectionStaffNickname,
} from "@/lib/api";
import {
  normalizeCollectionNicknameIds,
  sameCollectionNicknameIds,
  sortLeaderOptions,
} from "@/pages/collection-nicknames/utils";
import { parseApiError } from "@/pages/collection/utils";

type UseCollectionNicknameManagementDataOptions = {
  isSuperuser: boolean;
};

type UseCollectionNicknameManagementDataValue = {
  groups: CollectionAdminGroup[];
  setGroups: React.Dispatch<React.SetStateAction<CollectionAdminGroup[]>>;
  selectedGroupId: string;
  setSelectedGroupId: React.Dispatch<React.SetStateAction<string>>;
  expandedGroupIds: string[];
  groupSearch: string;
  setGroupSearch: React.Dispatch<React.SetStateAction<string>>;
  loadingGroups: boolean;
  nicknames: CollectionStaffNickname[];
  nicknameById: Map<string, CollectionStaffNickname>;
  nicknameIdByName: Map<string, string>;
  leaderOptions: CollectionStaffNickname[];
  nicknameSearch: string;
  setNicknameSearch: React.Dispatch<React.SetStateAction<string>>;
  loadingNicknames: boolean;
  assignedIds: string[];
  setAssignedIds: React.Dispatch<React.SetStateAction<string[]>>;
  savedAssignedIds: string[];
  setSavedAssignedIds: React.Dispatch<React.SetStateAction<string[]>>;
  pendingGroupSwitchId: string | null;
  confirmSwitchOpen: boolean;
  setConfirmSwitchOpen: React.Dispatch<React.SetStateAction<boolean>>;
  selectedGroup: CollectionAdminGroup | null;
  filteredGroups: CollectionAdminGroup[];
  filteredNicknames: CollectionStaffNickname[];
  activeAvailable: number;
  assignedActive: number;
  unsaved: boolean;
  reloadData: () => Promise<void>;
  trySelectGroup: (groupId: string) => void;
  toggleExpandGroup: (groupId: string) => void;
  toggleAssigned: (nicknameId: string, checked: boolean) => void;
  selectAll: () => void;
  clearAll: () => void;
  confirmGroupSwitch: () => void;
};

export type CollectionNicknameManagementDataValue = UseCollectionNicknameManagementDataValue;

export function useCollectionNicknameManagementData({
  isSuperuser,
}: UseCollectionNicknameManagementDataOptions): UseCollectionNicknameManagementDataValue {
  const { toast } = useToast();
  const isMountedRef = useRef(true);
  const groupsRequestIdRef = useRef(0);
  const nicknamesRequestIdRef = useRef(0);

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
  const [pendingGroupSwitchId, setPendingGroupSwitchId] = useState<string | null>(null);
  const [confirmSwitchOpen, setConfirmSwitchOpen] = useState(false);

  const deferredGroupSearch = useDeferredValue(groupSearch);
  const deferredNicknameSearch = useDeferredValue(nicknameSearch);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

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
    const requestId = ++groupsRequestIdRef.current;
    setLoadingGroups(true);
    try {
      const response = await getCollectionAdminGroups();
      if (!isMountedRef.current || requestId !== groupsRequestIdRef.current) return;
      const rows = Array.isArray(response?.groups) ? response.groups : [];
      setGroups(rows);
      setSelectedGroupId((previous) =>
        previous && rows.some((row) => row.id === previous) ? previous : rows[0]?.id || "",
      );
    } catch (error: unknown) {
      if (!isMountedRef.current || requestId !== groupsRequestIdRef.current) return;
      toast({
        title: "Failed to Load Admin Groups",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      if (!isMountedRef.current || requestId !== groupsRequestIdRef.current) return;
      setLoadingGroups(false);
    }
  }, [isSuperuser, toast]);

  const loadNicknames = useCallback(async () => {
    if (!isSuperuser) return;
    const requestId = ++nicknamesRequestIdRef.current;
    setLoadingNicknames(true);
    try {
      const response = await getCollectionNicknames({ includeInactive: true });
      if (!isMountedRef.current || requestId !== nicknamesRequestIdRef.current) return;
      setNicknames(Array.isArray(response?.nicknames) ? response.nicknames : []);
    } catch (error: unknown) {
      if (!isMountedRef.current || requestId !== nicknamesRequestIdRef.current) return;
      toast({
        title: "Failed to Load Nicknames",
        description: parseApiError(error),
        variant: "destructive",
      });
    } finally {
      if (!isMountedRef.current || requestId !== nicknamesRequestIdRef.current) return;
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

  const trySelectGroup = useCallback((groupId: string) => {
    if (!groupId || groupId === selectedGroupId) return;
    if (unsaved) {
      setPendingGroupSwitchId(groupId);
      setConfirmSwitchOpen(true);
      return;
    }
    setSelectedGroupId(groupId);
  }, [selectedGroupId, unsaved]);

  const toggleExpandGroup = useCallback((groupId: string) => {
    setExpandedGroupIds((previous) =>
      previous.includes(groupId)
        ? previous.filter((id) => id !== groupId)
        : [...previous, groupId],
    );
  }, []);

  const toggleAssigned = useCallback((nicknameId: string, checked: boolean) => {
    setAssignedIds((previous) =>
      checked
        ? normalizeCollectionNicknameIds([...previous, nicknameId])
        : previous.filter((id) => id !== nicknameId),
    );
  }, []);

  const selectAll = useCallback(() => {
    if (!selectedGroup) return;
    const leaderId = selectedGroup.leaderNicknameId || "";
    const selectableIds = filteredNicknames
      .filter((nickname) => nickname.isActive && nickname.id !== leaderId)
      .map((nickname) => nickname.id);
    setAssignedIds((previous) =>
      normalizeCollectionNicknameIds([...previous, ...selectableIds]),
    );
  }, [filteredNicknames, selectedGroup]);

  const clearAll = useCallback(() => {
    setAssignedIds([]);
  }, []);

  const confirmGroupSwitch = useCallback(() => {
    const nextGroupId = pendingGroupSwitchId;
    setPendingGroupSwitchId(null);
    setConfirmSwitchOpen(false);
    if (nextGroupId) setSelectedGroupId(nextGroupId);
  }, [pendingGroupSwitchId]);

  return {
    groups,
    setGroups,
    selectedGroupId,
    setSelectedGroupId,
    expandedGroupIds,
    groupSearch,
    setGroupSearch,
    loadingGroups,
    nicknames,
    nicknameById,
    nicknameIdByName,
    leaderOptions,
    nicknameSearch,
    setNicknameSearch,
    loadingNicknames,
    assignedIds,
    setAssignedIds,
    savedAssignedIds,
    setSavedAssignedIds,
    pendingGroupSwitchId,
    confirmSwitchOpen,
    setConfirmSwitchOpen,
    selectedGroup,
    filteredGroups,
    filteredNicknames,
    activeAvailable,
    assignedActive,
    unsaved,
    reloadData,
    trySelectGroup,
    toggleExpandGroup,
    toggleAssigned,
    selectAll,
    clearAll,
    confirmGroupSwitch,
  };
}

import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import type { CollectionAdminGroup, CollectionStaffNickname } from "@/lib/api";
import type { PendingUngroup } from "@/pages/collection-nicknames/utils";

type RoleScope = "admin" | "user" | "both";

type UseCollectionNicknameManagementDialogsValue = {
  createGroupOpen: boolean;
  setCreateGroupOpen: Dispatch<SetStateAction<boolean>>;
  createLeaderId: string;
  setCreateLeaderId: Dispatch<SetStateAction<string>>;
  creatingGroup: boolean;
  setCreatingGroup: Dispatch<SetStateAction<boolean>>;
  changeLeaderOpen: boolean;
  setChangeLeaderOpen: Dispatch<SetStateAction<boolean>>;
  changeLeaderId: string;
  setChangeLeaderId: Dispatch<SetStateAction<string>>;
  savingLeader: boolean;
  setSavingLeader: Dispatch<SetStateAction<boolean>>;
  pendingDeleteGroup: CollectionAdminGroup | null;
  setPendingDeleteGroup: Dispatch<SetStateAction<CollectionAdminGroup | null>>;
  deletingGroup: boolean;
  setDeletingGroup: Dispatch<SetStateAction<boolean>>;
  addOpen: boolean;
  setAddOpen: Dispatch<SetStateAction<boolean>>;
  newNickname: string;
  setNewNickname: Dispatch<SetStateAction<string>>;
  newRoleScope: RoleScope;
  setNewRoleScope: Dispatch<SetStateAction<RoleScope>>;
  addingNickname: boolean;
  setAddingNickname: Dispatch<SetStateAction<boolean>>;
  editingNickname: CollectionStaffNickname | null;
  setEditingNickname: Dispatch<SetStateAction<CollectionStaffNickname | null>>;
  editValue: string;
  setEditValue: Dispatch<SetStateAction<string>>;
  editRoleScope: RoleScope;
  setEditRoleScope: Dispatch<SetStateAction<RoleScope>>;
  savingEdit: boolean;
  setSavingEdit: Dispatch<SetStateAction<boolean>>;
  pendingDeactivate: CollectionStaffNickname | null;
  setPendingDeactivate: Dispatch<SetStateAction<CollectionStaffNickname | null>>;
  statusBusyId: string | null;
  setStatusBusyId: Dispatch<SetStateAction<string | null>>;
  pendingDeleteNickname: CollectionStaffNickname | null;
  setPendingDeleteNickname: Dispatch<SetStateAction<CollectionStaffNickname | null>>;
  deletingNicknameId: string | null;
  setDeletingNicknameId: Dispatch<SetStateAction<string | null>>;
  pendingResetPassword: CollectionStaffNickname | null;
  setPendingResetPassword: Dispatch<SetStateAction<CollectionStaffNickname | null>>;
  resettingNicknameId: string | null;
  setResettingNicknameId: Dispatch<SetStateAction<string | null>>;
  pendingUngroup: PendingUngroup | null;
  setPendingUngroup: Dispatch<SetStateAction<PendingUngroup | null>>;
  ungrouping: boolean;
  setUngrouping: Dispatch<SetStateAction<boolean>>;
  openChangeLeader: (leaderNicknameId: string) => void;
  startEditingNickname: (item: CollectionStaffNickname) => void;
};

export type CollectionNicknameManagementDialogsValue =
  UseCollectionNicknameManagementDialogsValue;

export function useCollectionNicknameManagementDialogs(): UseCollectionNicknameManagementDialogsValue {
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
  const [newRoleScope, setNewRoleScope] = useState<RoleScope>("both");
  const [addingNickname, setAddingNickname] = useState(false);
  const [editingNickname, setEditingNickname] = useState<CollectionStaffNickname | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editRoleScope, setEditRoleScope] = useState<RoleScope>("both");
  const [savingEdit, setSavingEdit] = useState(false);
  const [pendingDeactivate, setPendingDeactivate] = useState<CollectionStaffNickname | null>(null);
  const [statusBusyId, setStatusBusyId] = useState<string | null>(null);
  const [pendingDeleteNickname, setPendingDeleteNickname] =
    useState<CollectionStaffNickname | null>(null);
  const [deletingNicknameId, setDeletingNicknameId] = useState<string | null>(null);
  const [pendingResetPassword, setPendingResetPassword] =
    useState<CollectionStaffNickname | null>(null);
  const [resettingNicknameId, setResettingNicknameId] = useState<string | null>(null);
  const [pendingUngroup, setPendingUngroup] = useState<PendingUngroup | null>(null);
  const [ungrouping, setUngrouping] = useState(false);

  const openChangeLeader = useCallback((leaderNicknameId: string) => {
    setChangeLeaderId(leaderNicknameId);
    setChangeLeaderOpen(true);
  }, []);

  const startEditingNickname = useCallback((item: CollectionStaffNickname) => {
    setEditingNickname(item);
    setEditValue(item.nickname);
    setEditRoleScope(item.roleScope || "both");
  }, []);

  return {
    createGroupOpen,
    setCreateGroupOpen,
    createLeaderId,
    setCreateLeaderId,
    creatingGroup,
    setCreatingGroup,
    changeLeaderOpen,
    setChangeLeaderOpen,
    changeLeaderId,
    setChangeLeaderId,
    savingLeader,
    setSavingLeader,
    pendingDeleteGroup,
    setPendingDeleteGroup,
    deletingGroup,
    setDeletingGroup,
    addOpen,
    setAddOpen,
    newNickname,
    setNewNickname,
    newRoleScope,
    setNewRoleScope,
    addingNickname,
    setAddingNickname,
    editingNickname,
    setEditingNickname,
    editValue,
    setEditValue,
    editRoleScope,
    setEditRoleScope,
    savingEdit,
    setSavingEdit,
    pendingDeactivate,
    setPendingDeactivate,
    statusBusyId,
    setStatusBusyId,
    pendingDeleteNickname,
    setPendingDeleteNickname,
    deletingNicknameId,
    setDeletingNicknameId,
    pendingResetPassword,
    setPendingResetPassword,
    resettingNicknameId,
    setResettingNicknameId,
    pendingUngroup,
    setPendingUngroup,
    ungrouping,
    setUngrouping,
    openChangeLeader,
    startEditingNickname,
  };
}

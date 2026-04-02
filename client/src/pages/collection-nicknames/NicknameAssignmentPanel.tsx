import type { CollectionAdminGroup, CollectionStaffNickname } from "@/lib/api";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  NicknameAssignmentHeader,
  type NicknameAssignmentHeaderProps,
} from "@/pages/collection-nicknames/NicknameAssignmentHeader";
import {
  NicknameAssignmentTable,
  type NicknameAssignmentTableProps,
} from "@/pages/collection-nicknames/NicknameAssignmentTable";

export interface NicknameAssignmentPanelProps {
  selectedGroup: CollectionAdminGroup | null;
  selectedGroupId: string;
  assignedActive: number;
  activeAvailable: number;
  unsaved: boolean;
  nicknameSearch: string;
  loadingNicknames: boolean;
  filteredNicknames: CollectionStaffNickname[];
  assignedIds: string[];
  savingAssignment: boolean;
  statusBusyId: string | null;
  resettingNicknameId: string | null;
  deletingNicknameId: string | null;
  onNicknameSearchChange: (value: string) => void;
  onOpenCreateGroup: () => void;
  onOpenChangeLeader: () => void;
  onDeleteSelectedGroup: () => void;
  onOpenAddNickname: () => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  onSaveAssignment: () => void;
  onToggleAssigned: (nicknameId: string, checked: boolean) => void;
  onEditNickname: (nickname: CollectionStaffNickname) => void;
  onDeactivateNickname: (nickname: CollectionStaffNickname) => void;
  onActivateNickname: (nickname: CollectionStaffNickname) => void;
  onResetNicknamePassword: (nickname: CollectionStaffNickname) => void;
  onDeleteNickname: (nickname: CollectionStaffNickname) => void;
}

export function NicknameAssignmentPanel({
  selectedGroup,
  selectedGroupId,
  assignedActive,
  activeAvailable,
  unsaved,
  nicknameSearch,
  loadingNicknames,
  filteredNicknames,
  assignedIds,
  savingAssignment,
  statusBusyId,
  resettingNicknameId,
  deletingNicknameId,
  onNicknameSearchChange,
  onOpenCreateGroup,
  onOpenChangeLeader,
  onDeleteSelectedGroup,
  onOpenAddNickname,
  onSelectAll,
  onClearAll,
  onSaveAssignment,
  onToggleAssigned,
  onEditNickname,
  onDeactivateNickname,
  onActivateNickname,
  onResetNicknamePassword,
  onDeleteNickname,
}: NicknameAssignmentPanelProps) {
  const isMobile = useIsMobile();
  const headerProps: NicknameAssignmentHeaderProps = {
    selectedGroup,
    selectedGroupId,
    assignedActive,
    activeAvailable,
    unsaved,
    nicknameSearch,
    savingAssignment,
    onNicknameSearchChange,
    onOpenCreateGroup,
    onOpenChangeLeader,
    onDeleteSelectedGroup,
    onOpenAddNickname,
    onSelectAll,
    onClearAll,
    onSaveAssignment,
  };

  const tableProps: NicknameAssignmentTableProps = {
    selectedGroup,
    selectedGroupId,
    loadingNicknames,
    filteredNicknames,
    assignedIds,
    statusBusyId,
    resettingNicknameId,
    deletingNicknameId,
    onToggleAssigned,
    onEditNickname,
    onDeactivateNickname,
    onActivateNickname,
    onResetNicknamePassword,
    onDeleteNickname,
  };

  return (
    <div
      className={`border border-border/60 bg-background/40 ${isMobile ? "rounded-2xl p-4" : "rounded-xl p-3"}`}
    >
      <NicknameAssignmentHeader {...headerProps} />
      <NicknameAssignmentTable {...tableProps} />
    </div>
  );
}

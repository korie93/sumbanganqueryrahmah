import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CollectionAdminGroup } from "@/lib/api";

export interface NicknameAssignmentHeaderProps {
  selectedGroup: CollectionAdminGroup | null;
  selectedGroupId: string;
  assignedActive: number;
  activeAvailable: number;
  unsaved: boolean;
  nicknameSearch: string;
  savingAssignment: boolean;
  onNicknameSearchChange: (value: string) => void;
  onOpenCreateGroup: () => void;
  onOpenChangeLeader: () => void;
  onDeleteSelectedGroup: () => void;
  onOpenAddNickname: () => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  onSaveAssignment: () => void;
}

export function NicknameAssignmentHeader({
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
}: NicknameAssignmentHeaderProps) {
  return (
    <>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-2">
          <p className="text-sm font-semibold">Nickname List / Assignment</p>
          <p className="text-xs text-muted-foreground">
            {selectedGroup ? `Group dipilih: ${selectedGroup.leaderNickname}` : "Pilih admin group dahulu."}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Assigned: {assignedActive}</Badge>
            <Badge variant="secondary">Active Available: {activeAvailable}</Badge>
            {unsaved ? <Badge variant="destructive">Unsaved changes</Badge> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={onOpenCreateGroup}>
            Tambah Group
          </Button>
          <Button variant="outline" onClick={onOpenChangeLeader} disabled={!selectedGroup}>
            Tukar Leader
          </Button>
          <Button variant="destructive" onClick={onDeleteSelectedGroup} disabled={!selectedGroup}>
            Padam Group
          </Button>
          <Button variant="outline" onClick={onOpenAddNickname}>
            Tambah Nickname
          </Button>
        </div>
      </div>

      <div className="mb-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
        <Input
          value={nicknameSearch}
          onChange={(event) => onNicknameSearchChange(event.target.value)}
          placeholder="Cari nickname..."
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={onSelectAll} disabled={!selectedGroupId}>
            Select All
          </Button>
          <Button variant="outline" onClick={onClearAll} disabled={!selectedGroupId}>
            Clear All
          </Button>
          <Button onClick={onSaveAssignment} disabled={!selectedGroupId || savingAssignment || !unsaved}>
            {savingAssignment ? "Saving..." : "Save Assignment"}
          </Button>
        </div>
      </div>
    </>
  );
}

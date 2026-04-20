import { Badge } from "@/components/ui/badge";
import { MobileActionMenu } from "@/components/data/MobileActionMenu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";
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
  const isMobile = useIsMobile();

  return (
    <>
      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <p className={isMobile ? "text-base font-semibold" : "text-sm font-semibold"}>
            Nickname List / Assignment
          </p>
          <p className={`${isMobile ? "text-sm" : "text-xs"} text-muted-foreground`}>
            {selectedGroup ? `Group dipilih: ${selectedGroup.leaderNickname}` : "Pilih admin group dahulu."}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">Assigned: {assignedActive}</Badge>
            <Badge variant="secondary">Active Available: {activeAvailable}</Badge>
            {unsaved ? <Badge variant="destructive">Unsaved changes</Badge> : null}
          </div>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center lg:w-auto lg:justify-end" data-floating-ai-avoid="true">
          <Button variant="outline" onClick={onOpenAddNickname} className="w-full sm:w-auto">
            Tambah Nickname
          </Button>
          <Button variant="outline" onClick={onOpenCreateGroup} className="w-full sm:w-auto">
            Tambah Group
          </Button>
          {isMobile ? (
            <MobileActionMenu
              contentLabel="Group actions"
              items={[
                {
                  id: "change-leader",
                  label: "Tukar Leader",
                  onSelect: onOpenChangeLeader,
                  disabled: !selectedGroup,
                },
                {
                  id: "delete-group",
                  label: "Padam Group",
                  onSelect: onDeleteSelectedGroup,
                  disabled: !selectedGroup,
                  destructive: true,
                },
              ]}
            />
          ) : (
            <>
              <Button variant="outline" onClick={onOpenChangeLeader} disabled={!selectedGroup}>
                Tukar Leader
              </Button>
              <Button variant="destructive" onClick={onDeleteSelectedGroup} disabled={!selectedGroup}>
                Padam Group
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="mb-3 grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
        <Input
          id="nickname-assignment-search"
          name="nicknameAssignmentSearchQuery"
          type="search"
          value={nicknameSearch}
          onChange={(event) => onNicknameSearchChange(event.target.value)}
          aria-label="Cari nickname"
          placeholder="Cari nickname..."
          enterKeyHint="search"
          autoComplete="off"
          className={isMobile ? "h-12 rounded-2xl" : undefined}
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center" data-floating-ai-avoid="true">
          <Button variant="outline" onClick={onSelectAll} disabled={!selectedGroupId} className="w-full sm:w-auto">
            Select All
          </Button>
          <Button variant="outline" onClick={onClearAll} disabled={!selectedGroupId} className="w-full sm:w-auto">
            Clear All
          </Button>
          <Button onClick={onSaveAssignment} disabled={!selectedGroupId || savingAssignment || !unsaved} className="w-full sm:w-auto">
            {savingAssignment ? "Saving..." : "Save Assignment"}
          </Button>
        </div>
      </div>
    </>
  );
}

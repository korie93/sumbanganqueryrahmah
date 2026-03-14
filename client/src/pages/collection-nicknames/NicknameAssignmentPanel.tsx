import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CollectionAdminGroup, CollectionStaffNickname } from "@/lib/api";
import { collectionScopeLabel } from "@/pages/collection-nicknames/utils";

interface NicknameAssignmentPanelProps {
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
  return (
    <div className="rounded-md border border-border/60 bg-background/40 p-3">
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

      <div className="max-h-[58vh] overflow-auto pr-1">
        {loadingNicknames ? (
          <div className="rounded-md border border-border/60 p-6 text-center text-sm text-muted-foreground">
            Loading nickname data...
          </div>
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
                    <TableCell>
                      {isLeader ? (
                        <Badge variant="outline">Leader</Badge>
                      ) : (
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) => onToggleAssigned(item.id, Boolean(value))}
                          disabled={!item.isActive || !selectedGroupId}
                        />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{item.nickname}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{collectionScopeLabel(item.roleScope)}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={item.isActive ? "default" : "secondary"}>
                        {item.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-2">
                        <Button size="sm" variant="outline" onClick={() => onEditNickname(item)}>
                          Edit
                        </Button>
                        {item.isActive ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onDeactivateNickname(item)}
                            disabled={statusBusyId === item.id}
                          >
                            Nyahaktif
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onActivateNickname(item)}
                            disabled={statusBusyId === item.id}
                          >
                            Aktifkan
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onResetNicknamePassword(item)}
                          disabled={resettingNicknameId === item.id}
                        >
                          Reset Password
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => onDeleteNickname(item)}
                          disabled={deletingNicknameId === item.id}
                        >
                          Delete
                        </Button>
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
  );
}

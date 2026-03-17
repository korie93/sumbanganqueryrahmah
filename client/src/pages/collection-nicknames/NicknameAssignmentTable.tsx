import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CollectionAdminGroup, CollectionStaffNickname } from "@/lib/api";
import { collectionScopeLabel } from "@/pages/collection-nicknames/utils";

export interface NicknameAssignmentTableProps {
  selectedGroup: CollectionAdminGroup | null;
  selectedGroupId: string;
  loadingNicknames: boolean;
  filteredNicknames: CollectionStaffNickname[];
  assignedIds: string[];
  statusBusyId: string | null;
  resettingNicknameId: string | null;
  deletingNicknameId: string | null;
  onToggleAssigned: (nicknameId: string, checked: boolean) => void;
  onEditNickname: (nickname: CollectionStaffNickname) => void;
  onDeactivateNickname: (nickname: CollectionStaffNickname) => void;
  onActivateNickname: (nickname: CollectionStaffNickname) => void;
  onResetNicknamePassword: (nickname: CollectionStaffNickname) => void;
  onDeleteNickname: (nickname: CollectionStaffNickname) => void;
}

export function NicknameAssignmentTable({
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
}: NicknameAssignmentTableProps) {
  return (
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
  );
}

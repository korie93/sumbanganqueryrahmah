import { Badge } from "@/components/ui/badge";
import { MobileActionMenu } from "@/components/data/MobileActionMenu";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useIsMobile } from "@/hooks/use-mobile";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CollectionAdminGroup, CollectionStaffNickname } from "@/lib/api";
import { buildNicknameAssignmentRowAriaLabel } from "@/pages/collection-nicknames/collection-nickname-row-aria";
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
  const isMobile = useIsMobile();

  return (
    <div className="max-h-[58vh] overflow-auto pr-1">
      {loadingNicknames ? (
        <div className="rounded-md border border-border/60 p-6 text-center text-sm text-muted-foreground">
          Loading nickname data...
        </div>
      ) : isMobile ? (
        <div className="space-y-3">
          {filteredNicknames.map((item) => {
            const isLeader = selectedGroup?.leaderNicknameId === item.id;
            const checked = isLeader || assignedIds.includes(item.id);

            return (
              <article
                key={item.id}
                role="group"
                aria-label={buildNicknameAssignmentRowAriaLabel({
                  isAssigned: checked,
                  isLeader,
                  nickname: item,
                })}
                className="space-y-3 rounded-xl border border-border/60 bg-background/70 p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-2">
                    <p className="break-words font-medium text-foreground">{item.nickname}</p>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">{collectionScopeLabel(item.roleScope)}</Badge>
                      <Badge variant={item.isActive ? "default" : "secondary"}>
                        {item.isActive ? "Active" : "Inactive"}
                      </Badge>
                      {isLeader ? <Badge variant="outline">Leader</Badge> : null}
                    </div>
                  </div>
                  {isLeader ? (
                    <Badge variant="outline" className="shrink-0">Leader</Badge>
                  ) : (
                    <label className="flex shrink-0 items-center gap-2 rounded-lg border border-border/60 bg-muted/15 px-3 py-2 text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => onToggleAssigned(item.id, Boolean(value))}
                        disabled={!item.isActive || !selectedGroupId}
                      />
                      <span>Assign</span>
                    </label>
                  )}
                </div>

                <div className="flex flex-col gap-2" data-floating-ai-avoid="true">
                  <Button variant="outline" className="w-full" onClick={() => onEditNickname(item)}>
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => (item.isActive ? onDeactivateNickname(item) : onActivateNickname(item))}
                    disabled={statusBusyId === item.id}
                  >
                    {item.isActive ? "Nyahaktif" : "Aktifkan"}
                  </Button>
                  <div className="flex items-center justify-end">
                    <MobileActionMenu
                      contentLabel="Nickname actions"
                      items={[
                        {
                          id: `reset-${item.id}`,
                          label: resettingNicknameId === item.id ? "Resetting..." : "Reset Password",
                          onSelect: () => onResetNicknamePassword(item),
                          disabled: resettingNicknameId === item.id,
                        },
                        {
                          id: `delete-${item.id}`,
                          label: deletingNicknameId === item.id ? "Deleting..." : "Delete",
                          onSelect: () => onDeleteNickname(item),
                          disabled: deletingNicknameId === item.id,
                          destructive: true,
                        },
                      ]}
                    />
                  </div>
                </div>
              </article>
            );
          })}
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
                <TableRow
                  key={item.id}
                  aria-label={buildNicknameAssignmentRowAriaLabel({
                    isAssigned: checked,
                    isLeader,
                    nickname: item,
                  })}
                >
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

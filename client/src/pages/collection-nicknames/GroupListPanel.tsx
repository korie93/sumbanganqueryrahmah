import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CollectionAdminGroup } from "@/lib/api";

interface GroupListPanelProps {
  loadingGroups: boolean;
  filteredGroups: CollectionAdminGroup[];
  expandedGroupIds: string[];
  selectedGroupId: string;
  groupSearch: string;
  onGroupSearchChange: (value: string) => void;
  onToggleExpandGroup: (groupId: string) => void;
  onSelectGroup: (groupId: string) => void;
  onUngroup: (groupId: string, nicknameId: string) => void;
  nicknameIdByName: Map<string, string>;
}

export function GroupListPanel({
  loadingGroups,
  filteredGroups,
  expandedGroupIds,
  selectedGroupId,
  groupSearch,
  onGroupSearchChange,
  onToggleExpandGroup,
  onSelectGroup,
  onUngroup,
  nicknameIdByName,
}: GroupListPanelProps) {
  return (
    <div className="rounded-md border border-border/60 bg-background/40 p-3">
      <div className="space-y-2">
        <Label>Admin Nickname Groups</Label>
        <Input
          value={groupSearch}
          onChange={(event) => onGroupSearchChange(event.target.value)}
          placeholder="Cari leader/member..."
        />
      </div>
      <div className="mt-3 max-h-[58vh] overflow-y-auto space-y-2 pr-1">
        {loadingGroups ? (
          <p className="text-sm text-muted-foreground">Loading groups...</p>
        ) : filteredGroups.length === 0 ? (
          <p className="text-sm text-muted-foreground">Tiada admin group ditemui.</p>
        ) : (
          filteredGroups.map((group) => {
            const expanded = expandedGroupIds.includes(group.id);
            const members = (group.memberNicknames || [])
              .slice()
              .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

            return (
              <div key={group.id} className="rounded-md border border-border/60 bg-background/50">
                <div className="flex items-center justify-between px-2 py-2">
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 text-left"
                    onClick={() => onToggleExpandGroup(group.id)}
                  >
                    <ChevronRight className={`h-4 w-4 transition ${expanded ? "rotate-90" : ""}`} />
                    <span className="text-sm font-medium">{group.leaderNickname}</span>
                  </button>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{members.length}</Badge>
                    <Button
                      size="sm"
                      variant={selectedGroupId === group.id ? "default" : "outline"}
                      onClick={() => onSelectGroup(group.id)}
                    >
                      Open
                    </Button>
                  </div>
                </div>

                {expanded ? (
                  <div className="border-t border-border/60 px-3 py-2 space-y-2">
                    {members.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Tiada member dalam group ini.</p>
                    ) : (
                      members.map((memberNickname) => {
                        const nicknameId = nicknameIdByName.get(memberNickname.toLowerCase()) || "";
                        return (
                          <div
                            key={`${group.id}-${memberNickname}`}
                            className="flex items-center justify-between gap-2 text-sm"
                          >
                            <span className="truncate">- {memberNickname}</span>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => nicknameId && onUngroup(group.id, nicknameId)}
                              disabled={!nicknameId}
                            >
                              Ungroup
                            </Button>
                          </div>
                        );
                      })
                    )}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

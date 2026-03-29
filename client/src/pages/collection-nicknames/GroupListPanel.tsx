import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CollectionAdminGroup } from "@/lib/api";

export interface GroupListPanelProps {
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
    <div className="rounded-xl border border-border/60 bg-background/40 p-3">
      <div className="space-y-2">
        <Label>Admin Nickname Groups</Label>
        <Input
          value={groupSearch}
          onChange={(event) => onGroupSearchChange(event.target.value)}
          placeholder="Cari leader/member..."
          enterKeyHint="search"
        />
      </div>
      <div className="mt-3 max-h-[58vh] space-y-2 overflow-y-auto pr-1">
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
              <div key={group.id} className="rounded-xl border border-border/60 bg-background/50">
                <div className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    className="inline-flex min-w-0 items-center gap-2 text-left"
                    onClick={() => onToggleExpandGroup(group.id)}
                  >
                    <ChevronRight className={`h-4 w-4 transition ${expanded ? "rotate-90" : ""}`} />
                    <span className="truncate text-sm font-medium">{group.leaderNickname}</span>
                  </button>
                  <div className="flex items-center gap-2" data-floating-ai-avoid="true">
                    <Badge variant="outline">{members.length}</Badge>
                    <Button
                      size="sm"
                      variant={selectedGroupId === group.id ? "default" : "outline"}
                      onClick={() => onSelectGroup(group.id)}
                      className="w-full sm:w-auto"
                    >
                      Open
                    </Button>
                  </div>
                </div>

                {expanded ? (
                  <div className="space-y-2 border-t border-border/60 px-3 py-2">
                    {members.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Tiada member dalam group ini.</p>
                    ) : (
                      members.map((memberNickname) => {
                        const nicknameId = nicknameIdByName.get(memberNickname.toLowerCase()) || "";
                        return (
                          <div
                            key={`${group.id}-${memberNickname}`}
                            className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                          >
                            <span className="truncate">- {memberNickname}</span>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => nicknameId && onUngroup(group.id, nicknameId)}
                              disabled={!nicknameId}
                              className="w-full sm:w-auto"
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

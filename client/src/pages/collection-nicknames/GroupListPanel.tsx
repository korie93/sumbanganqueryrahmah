import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useIsMobile } from "@/hooks/use-mobile";
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
  const isMobile = useIsMobile();

  return (
    <div
      className={`border border-border/60 bg-background/40 ${isMobile ? "rounded-2xl p-4" : "rounded-xl p-3"}`}
    >
      <div className="mb-4 space-y-1">
        <p className="text-sm font-semibold text-foreground">Admin Groups</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Search the available admin nickname groups, expand members, and choose the active group before updating assignments.
        </p>
      </div>
      <div className="space-y-2">
        <Label>Admin Nickname Groups</Label>
        <Input
          value={groupSearch}
          onChange={(event) => onGroupSearchChange(event.target.value)}
          placeholder="Cari leader/member..."
          enterKeyHint="search"
          className={isMobile ? "h-12 rounded-2xl" : undefined}
        />
      </div>
      <div className={`mt-3 space-y-2 overflow-y-auto pr-1 ${isMobile ? "max-h-[48vh]" : "max-h-[58vh]"}`}>
        {loadingGroups ? (
          <p className="text-sm text-muted-foreground">Loading groups...</p>
        ) : filteredGroups.length === 0 ? (
          <p className="text-sm text-muted-foreground">Tiada admin group ditemui.</p>
        ) : (
          filteredGroups.map((group) => {
            const expanded = expandedGroupIds.includes(group.id);
            const memberListId = `group-members-${group.id}`;
            const members = (group.memberNicknames || [])
              .slice()
              .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

            return (
              <div
                key={group.id}
                className={`border border-border/60 bg-background/50 ${isMobile ? "rounded-2xl" : "rounded-xl"}`}
              >
                <div className="flex flex-col gap-3 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    className="inline-flex min-w-0 items-center gap-2 text-left"
                    onClick={() => onToggleExpandGroup(group.id)}
                    aria-expanded={expanded}
                    aria-controls={memberListId}
                    title={expanded ? "Collapse group members" : "Expand group members"}
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
                  <div id={memberListId} className="space-y-2 border-t border-border/60 px-3 py-2">
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

import { ChevronDown, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { CollectionDailyUser } from "@/lib/api";
import type { EditableCalendarDay } from "@/pages/collection/CollectionDailyShared";

type CollectionDailyUserFilterControlProps = {
  userPopoverOpen: boolean;
  onUserPopoverOpenChange: (open: boolean) => void;
  loadingUsers: boolean;
  selectedUsersLabel: string;
  users: CollectionDailyUser[];
  selectedUserSet: Set<string>;
  allUsersSelected: boolean;
  partiallySelected: boolean;
  selectedUsernamesCount: number;
  onToggleSelectedUser: (username: string, checked: boolean) => void;
  onSelectAllUsers: () => void;
  onClearSelectedUsers: () => void;
};

export function CollectionDailyUserFilterControl({
  userPopoverOpen,
  onUserPopoverOpenChange,
  loadingUsers,
  selectedUsersLabel,
  users,
  selectedUserSet,
  allUsersSelected,
  partiallySelected,
  selectedUsernamesCount,
  onToggleSelectedUser,
  onSelectAllUsers,
  onClearSelectedUsers,
}: CollectionDailyUserFilterControlProps) {
  return (
    <Popover open={userPopoverOpen} onOpenChange={onUserPopoverOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-between"
          disabled={loadingUsers}
          data-testid="collection-daily-user-trigger"
        >
          <span className="truncate text-left">{selectedUsersLabel}</span>
          {loadingUsers ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          ) : (
            <ChevronDown className="h-4 w-4 shrink-0" />
          )}
        </Button>
      </PopoverTrigger>
      {userPopoverOpen ? (
        <PopoverContent
          align="start"
          className="w-[min(340px,calc(100vw-1.5rem))] p-2"
          data-testid="collection-daily-user-popover"
        >
          {loadingUsers ? (
            <div className="flex items-center justify-center gap-2 px-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading staff nicknames...
            </div>
          ) : users.length === 0 ? (
            <p className="px-2 py-3 text-sm text-muted-foreground">No staff nicknames available.</p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={allUsersSelected ? true : partiallySelected ? "indeterminate" : false}
                    onCheckedChange={(checked) => {
                      if (checked === true) onSelectAllUsers();
                      else onClearSelectedUsers();
                    }}
                    disabled={loadingUsers}
                  />
                  <span className="text-xs font-medium">Select all staff nicknames</span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onClearSelectedUsers}
                  disabled={selectedUsernamesCount === 0 || loadingUsers}
                >
                  Clear
                </Button>
              </div>

              <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                {users.map((userItem) => {
                  const normalized = userItem.username.toLowerCase();
                  const checked = selectedUserSet.has(normalized);
                  return (
                    <label
                      key={userItem.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-accent/40"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(state) =>
                          onToggleSelectedUser(userItem.username, state === true)
                        }
                        disabled={loadingUsers}
                      />
                      <span className="text-sm">{userItem.username}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </PopoverContent>
      ) : null}
    </Popover>
  );
}

type CollectionDailyTargetControlsProps = {
  monthlyTargetInput: string;
  onMonthlyTargetInputChange: (value: string) => void;
  canEditTarget: boolean;
  savingTarget: boolean;
  onSaveTarget: () => void;
  savingCalendar: boolean;
  onSaveCalendar: () => void;
  calendarDays: EditableCalendarDay[];
};

export function CollectionDailyTargetControls({
  monthlyTargetInput,
  onMonthlyTargetInputChange,
  canEditTarget,
  savingTarget,
  onSaveTarget,
  savingCalendar,
  onSaveCalendar,
  calendarDays,
}: CollectionDailyTargetControlsProps) {
  return (
    <div className="grid gap-3 rounded-xl border border-border/70 bg-background/70 p-4 md:grid-cols-[220px_auto] md:items-end">
      <div className="space-y-1">
        <Label>Monthly Target (RM)</Label>
        <Input
          type="number"
          min={0}
          step={0.01}
          value={monthlyTargetInput}
          onChange={(event) => onMonthlyTargetInputChange(event.target.value)}
          disabled={!canEditTarget}
        />
        {!canEditTarget ? (
          <p className="text-xs text-muted-foreground">
            Select exactly one staff nickname to edit monthly target.
          </p>
        ) : null}
      </div>
      <div
        className="flex flex-col gap-2 sm:flex-row sm:flex-wrap"
        data-floating-ai-avoid="true"
      >
        <Button className="w-full sm:w-auto" onClick={onSaveTarget} disabled={savingTarget || !canEditTarget}>
          {savingTarget ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save Target
        </Button>
        <Button
          variant="outline"
          className="w-full sm:w-auto"
          onClick={onSaveCalendar}
          disabled={savingCalendar || calendarDays.length === 0}
        >
          {savingCalendar ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save Calendar
        </Button>
      </div>
    </div>
  );
}

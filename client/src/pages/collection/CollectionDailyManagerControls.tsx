import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2, Save, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import type { CollectionDailyUser } from "@/lib/api";
import type { EditableCalendarDay } from "@/pages/collection/CollectionDailyShared";

type CollectionDailyUserFilterControlProps = {
  triggerId: string;
  triggerLabelId?: string;
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
  triggerId,
  triggerLabelId,
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
  const isMobile = useIsMobile();
  const [searchValue, setSearchValue] = useState("");
  const triggerValueId = `${triggerId}-value`;

  useEffect(() => {
    if (!userPopoverOpen) {
      setSearchValue("");
    }
  }, [userPopoverOpen]);

  const filteredUsers = useMemo(() => {
    const normalizedSearch = searchValue.trim().toLowerCase();
    if (!normalizedSearch) {
      return users;
    }

    return users.filter((userItem) => userItem.username.toLowerCase().includes(normalizedSearch));
  }, [searchValue, users]);

  return (
    <Popover open={userPopoverOpen} onOpenChange={onUserPopoverOpenChange}>
      <PopoverTrigger asChild>
        <Button
          id={triggerId}
          type="button"
          variant="outline"
          className={cn(
            "w-full justify-between bg-background text-left shadow-sm",
            isMobile ? "h-12 rounded-2xl px-4" : "h-11 rounded-xl px-4",
          )}
          disabled={loadingUsers}
          aria-expanded={userPopoverOpen}
          aria-haspopup="dialog"
          aria-labelledby={triggerLabelId ? `${triggerLabelId} ${triggerValueId}` : undefined}
          data-testid="collection-daily-user-trigger"
        >
          <span id={triggerValueId} className="truncate text-left">{selectedUsersLabel}</span>
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
          className={cn(
            "w-[min(360px,calc(100vw-1.5rem))] border border-border/70 bg-popover p-2 text-popover-foreground shadow-xl",
            isMobile ? "rounded-2xl" : "rounded-xl",
          )}
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
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  value={searchValue}
                  onChange={(event) => setSearchValue(event.target.value)}
                  placeholder="Cari staff..."
                  className="h-10 rounded-xl bg-background pl-9"
                  aria-label="Cari staff nickname"
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>

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
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-full px-3"
                  onClick={onClearSelectedUsers}
                  disabled={selectedUsernamesCount === 0 || loadingUsers}
                >
                  Clear
                </Button>
              </div>

              {filteredUsers.length === 0 ? (
                <p className="px-2 py-3 text-sm text-muted-foreground">
                  Tiada staff sepadan dengan carian ini.
                </p>
              ) : (
                <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                  {filteredUsers.map((userItem) => {
                  const normalized = userItem.username.toLowerCase();
                  const checked = selectedUserSet.has(normalized);
                  return (
                    <label
                      key={userItem.id}
                      className="flex cursor-pointer items-center gap-2 rounded-xl px-2 py-2 hover:bg-accent/40"
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
              )}
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
  const isMobile = useIsMobile();

  return (
    <div
      className={cn(
        "gap-3 border border-border/70 bg-background p-4 shadow-sm",
        isMobile ? "space-y-4 rounded-2xl" : "grid rounded-2xl md:grid-cols-[220px_auto] md:items-end",
      )}
    >
      <div className="space-y-1">
        <Label htmlFor="collection-daily-monthly-target">Monthly Target (RM)</Label>
        <Input
          id="collection-daily-monthly-target"
          name="collectionDailyMonthlyTarget"
          type="text"
          inputMode="decimal"
          placeholder="0.00"
          autoComplete="off"
          value={monthlyTargetInput}
          onChange={(event) => onMonthlyTargetInputChange(event.target.value)}
          disabled={!canEditTarget}
          className={isMobile ? "h-12 rounded-2xl bg-background" : "h-11 rounded-xl bg-background"}
        />
        {!canEditTarget ? (
          <p className="text-xs text-muted-foreground">
            Select exactly one staff nickname to edit monthly target.
          </p>
        ) : null}
      </div>
      <div
        className={cn(
          "gap-2",
          isMobile ? "grid sm:grid-cols-2" : "flex flex-col sm:flex-row sm:flex-wrap",
        )}
        data-floating-ai-avoid="true"
      >
        <Button
          type="button"
          className={cn("w-full", isMobile ? "h-12 rounded-2xl" : "h-11 rounded-xl sm:w-auto")}
          onClick={onSaveTarget}
          disabled={savingTarget || !canEditTarget}
        >
          {savingTarget ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Save className="mr-2 h-4 w-4" />
          )}
          Save Target
        </Button>
        <Button
          type="button"
          variant="outline"
          className={cn("w-full", isMobile ? "h-12 rounded-2xl" : "h-11 rounded-xl sm:w-auto")}
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

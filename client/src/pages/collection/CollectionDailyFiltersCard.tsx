import { Suspense, lazy } from "react";
import { CalendarDays, Loader2 } from "lucide-react";
import { OperationalSectionCard } from "@/components/layout/OperationalPage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useIsMobile } from "@/hooks/use-mobile";
import type { CollectionDailyUser } from "@/lib/api";
import type { EditableCalendarDay } from "@/pages/collection/CollectionDailyShared";

const CollectionDailyUserFilterControl = lazy(() =>
  import("@/pages/collection/CollectionDailyManagerControls").then((module) => ({
    default: module.CollectionDailyUserFilterControl,
  })),
);
const CollectionDailyTargetControls = lazy(() =>
  import("@/pages/collection/CollectionDailyManagerControls").then((module) => ({
    default: module.CollectionDailyTargetControls,
  })),
);

type CollectionDailyFiltersCardProps = {
  canManage: boolean;
  currentUsername: string;
  yearInput: string;
  monthInput: string;
  minYear: number;
  maxYear: number;
  onYearInputChange: (value: string) => void;
  onMonthInputChange: (value: string) => void;
  onYearCommit: () => number;
  onMonthCommit: () => number;
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
  loadingOverview: boolean;
  onRefresh: () => void;
  monthlyTargetInput: string;
  onMonthlyTargetInputChange: (value: string) => void;
  canEditTarget: boolean;
  savingTarget: boolean;
  onSaveTarget: () => void;
  savingCalendar: boolean;
  onSaveCalendar: () => void;
  calendarDays: EditableCalendarDay[];
};

export function CollectionDailyFiltersCard({
  canManage,
  currentUsername,
  yearInput,
  monthInput,
  minYear,
  maxYear,
  onYearInputChange,
  onMonthInputChange,
  onYearCommit,
  onMonthCommit,
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
  loadingOverview,
  onRefresh,
  monthlyTargetInput,
  onMonthlyTargetInputChange,
  canEditTarget,
  savingTarget,
  onSaveTarget,
  savingCalendar,
  onSaveCalendar,
  calendarDays,
}: CollectionDailyFiltersCardProps) {
  const isMobile = useIsMobile();
  const managerUserFilterFallback = (
    <div className="space-y-1">
      <Label>Staff Nickname</Label>
      <div
        className={`animate-pulse border border-border/60 bg-muted/20 ${
          isMobile ? "h-12 rounded-2xl" : "h-10 rounded-md"
        }`}
      />
    </div>
  );

  const managerTargetControlsFallback = (
    <div
      className={`gap-3 border border-border/70 bg-background/70 p-4 ${
        isMobile
          ? "space-y-3 rounded-2xl"
          : "grid rounded-xl md:grid-cols-[220px_auto] md:items-end"
      }`}
    >
      <div className="space-y-1">
        <div className="h-4 w-32 animate-pulse rounded bg-muted/30" />
        <div
          className={`animate-pulse border border-border/60 bg-muted/20 ${
            isMobile ? "h-12 rounded-2xl" : "h-10 rounded-md"
          }`}
        />
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div
          className={`h-10 w-full animate-pulse border border-border/60 bg-muted/20 ${
            isMobile ? "rounded-2xl" : "rounded-md"
          }`}
        />
        <div
          className={`h-10 w-full animate-pulse border border-border/60 bg-muted/20 ${
            isMobile ? "rounded-2xl" : "rounded-md"
          }`}
        />
      </div>
    </div>
  );

  return (
    <OperationalSectionCard
      title={
        <span className="flex items-center gap-2" data-testid="collection-daily-title">
          <CalendarDays className="h-5 w-5" />
          Collection Daily
        </span>
      }
      description="Set month, selected staff nicknames, and working-day targets from one place."
      actions={
        <Button
          variant="outline"
          className={isMobile ? "w-full sm:w-auto" : undefined}
          onClick={onRefresh}
          disabled={loadingOverview}
          data-testid="collection-daily-refresh"
        >
          {loadingOverview ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Refresh
        </Button>
      }
    >
        {isMobile ? (
          <div className="space-y-3">
            <div className="rounded-2xl border border-border/60 bg-background/80 px-3 py-3 shadow-sm">
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px]">
                    Year {yearInput || "-"}
                  </Badge>
                  <Badge variant="secondary" className="rounded-full px-3 py-1 text-[11px]">
                    Month {monthInput || "-"}
                  </Badge>
                  <Badge variant="outline" className="max-w-full rounded-full px-3 py-1 text-[11px]">
                    <span className="truncate">
                      {canManage ? selectedUsersLabel : currentUsername}
                    </span>
                  </Badge>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Adjust period and staff scope first, then save target or calendar only when changes are ready.
                </p>
              </div>
            </div>

            <section className="space-y-3 rounded-2xl border border-border/60 bg-muted/10 p-3.5">
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-foreground">Reporting Period</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Change month or year to refresh the daily collection view.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Year</Label>
                  <Input
                    type="number"
                    min={minYear}
                    max={maxYear}
                    value={yearInput}
                    onChange={(event) => onYearInputChange(event.target.value)}
                    onBlur={onYearCommit}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        onYearCommit();
                      }
                    }}
                    className="h-12 rounded-2xl"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Month</Label>
                  <Input
                    type="number"
                    min={1}
                    max={12}
                    value={monthInput}
                    onChange={(event) => onMonthInputChange(event.target.value)}
                    onBlur={onMonthCommit}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        onMonthCommit();
                      }
                    }}
                    className="h-12 rounded-2xl"
                  />
                </div>
              </div>
            </section>

            <section className="space-y-3 rounded-2xl border border-border/60 bg-muted/10 p-3.5">
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-foreground">Staff Scope</h3>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {canManage
                    ? "Choose one or more staff nicknames before editing target or calendar."
                    : "Your current account is used automatically for this daily view."}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Staff Nickname</Label>
                {canManage ? (
                  <Suspense fallback={managerUserFilterFallback}>
                    <CollectionDailyUserFilterControl
                      userPopoverOpen={userPopoverOpen}
                      onUserPopoverOpenChange={onUserPopoverOpenChange}
                      loadingUsers={loadingUsers}
                      selectedUsersLabel={selectedUsersLabel}
                      users={users}
                      selectedUserSet={selectedUserSet}
                      allUsersSelected={allUsersSelected}
                      partiallySelected={partiallySelected}
                      selectedUsernamesCount={selectedUsernamesCount}
                      onToggleSelectedUser={onToggleSelectedUser}
                      onSelectAllUsers={onSelectAllUsers}
                      onClearSelectedUsers={onClearSelectedUsers}
                    />
                  </Suspense>
                ) : (
                  <Input value={currentUsername} readOnly className="h-12 rounded-2xl" />
                )}
              </div>
            </section>

            {canManage ? (
              <Suspense fallback={managerTargetControlsFallback}>
                <CollectionDailyTargetControls
                  monthlyTargetInput={monthlyTargetInput}
                  onMonthlyTargetInputChange={onMonthlyTargetInputChange}
                  canEditTarget={canEditTarget}
                  savingTarget={savingTarget}
                  onSaveTarget={onSaveTarget}
                  savingCalendar={savingCalendar}
                  onSaveCalendar={onSaveCalendar}
                  calendarDays={calendarDays}
                />
              </Suspense>
            ) : null}
          </div>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="space-y-1">
                <Label>Year</Label>
                <Input
                  type="number"
                  min={minYear}
                  max={maxYear}
                  value={yearInput}
                  onChange={(event) => onYearInputChange(event.target.value)}
                  onBlur={onYearCommit}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      onYearCommit();
                    }
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label>Month</Label>
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={monthInput}
                  onChange={(event) => onMonthInputChange(event.target.value)}
                  onBlur={onMonthCommit}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      onMonthCommit();
                    }
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label>Staff Nickname</Label>
                {canManage ? (
                  <Suspense fallback={managerUserFilterFallback}>
                    <CollectionDailyUserFilterControl
                      userPopoverOpen={userPopoverOpen}
                      onUserPopoverOpenChange={onUserPopoverOpenChange}
                      loadingUsers={loadingUsers}
                      selectedUsersLabel={selectedUsersLabel}
                      users={users}
                      selectedUserSet={selectedUserSet}
                      allUsersSelected={allUsersSelected}
                      partiallySelected={partiallySelected}
                      selectedUsernamesCount={selectedUsernamesCount}
                      onToggleSelectedUser={onToggleSelectedUser}
                      onSelectAllUsers={onSelectAllUsers}
                      onClearSelectedUsers={onClearSelectedUsers}
                    />
                  </Suspense>
                ) : (
                  <Input value={currentUsername} readOnly />
                )}
              </div>
            </div>

            {canManage ? (
              <Suspense fallback={managerTargetControlsFallback}>
                <CollectionDailyTargetControls
                  monthlyTargetInput={monthlyTargetInput}
                  onMonthlyTargetInputChange={onMonthlyTargetInputChange}
                  canEditTarget={canEditTarget}
                  savingTarget={savingTarget}
                  onSaveTarget={onSaveTarget}
                  savingCalendar={savingCalendar}
                  onSaveCalendar={onSaveCalendar}
                  calendarDays={calendarDays}
                />
              </Suspense>
            ) : null}
          </>
        )}
    </OperationalSectionCard>
  );
}

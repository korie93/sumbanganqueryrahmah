import { Suspense } from "react";
import { lazyWithPreload } from "@/lib/lazy-with-preload";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CollectionDailyStaffScopeFieldProps } from "@/pages/collection/collection-daily-filters-card-shared";

const CollectionDailyUserFilterControl = lazyWithPreload(() =>
  import("@/pages/collection/CollectionDailyManagerControls").then((module) => ({
    default: module.CollectionDailyUserFilterControl,
  })),
);

export function CollectionDailyStaffScopeField({
  canManage,
  currentUsername,
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
  isMobile,
}: CollectionDailyStaffScopeFieldProps) {
  const fallbackClassName = isMobile ? "h-12 rounded-2xl" : "h-10 rounded-md";
  const readOnlyClassName = isMobile ? "h-12 rounded-2xl" : undefined;
  const fieldId = "collection-daily-current-username";

  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId}>Staff Nickname</Label>
      {canManage ? (
        <Suspense
          fallback={(
            <div
              className={`animate-pulse border border-border/60 bg-muted/20 ${fallbackClassName}`}
            />
          )}
        >
          <CollectionDailyUserFilterControl
            triggerId={fieldId}
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
        <Input
          id={fieldId}
          name="collectionDailyCurrentUsername"
          value={currentUsername}
          readOnly
          autoComplete="username"
          className={readOnlyClassName}
        />
      )}
    </div>
  );
}

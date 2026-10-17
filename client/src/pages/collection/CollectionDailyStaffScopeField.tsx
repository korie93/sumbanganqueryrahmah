import { Suspense, lazy } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CollectionDailyStaffScopeFieldProps } from "@/pages/collection/collection-daily-filters-card-shared";

const NicknameSelector = lazy(() =>
  import("@/pages/collection/NicknameSelector").then((module) => ({
    default: module.NicknameSelector,
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
}: CollectionDailyStaffScopeFieldProps) {
  const fallbackClassName = "h-11 rounded-md";
  const readOnlyClassName = `${fallbackClassName} bg-background min-h-11 sm:h-11 sm:min-h-11`;
  const fieldId = "collection-daily-current-username";
  const fieldLabelId = `${fieldId}-label`;

  return (
    <div className="space-y-2">
      {canManage ? (
        <>
          <span
            id={fieldLabelId}
            className="block text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
          >
            Staff Nickname
          </span>
          <Suspense
            fallback={(
              <div
                className={`animate-pulse border border-border/60 bg-muted/20 ${fallbackClassName}`}
              />
            )}
          >
            <NicknameSelector
              triggerId={fieldId}
              triggerLabelId={fieldLabelId}
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
        </>
      ) : (
        <>
          <Label className="block" htmlFor={fieldId}>Staff Nickname</Label>
          <Input
            id={fieldId}
            name="collectionDailyCurrentUsername"
            value={currentUsername}
            readOnly
            autoComplete="username"
            className={readOnlyClassName}
          />
        </>
      )}
    </div>
  );
}

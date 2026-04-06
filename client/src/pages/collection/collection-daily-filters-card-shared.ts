import type { CollectionDailyUser } from "@/lib/api";
import type { EditableCalendarDay } from "@/pages/collection/CollectionDailyShared";

export type CollectionDailyFiltersCardProps = {
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

export type CollectionDailyPeriodFieldsProps = Pick<
  CollectionDailyFiltersCardProps,
  | "yearInput"
  | "monthInput"
  | "minYear"
  | "maxYear"
  | "onYearInputChange"
  | "onMonthInputChange"
  | "onYearCommit"
  | "onMonthCommit"
> & {
  isMobile: boolean;
  containerClassName?: string;
};

export type CollectionDailyStaffScopeFieldProps = Pick<
  CollectionDailyFiltersCardProps,
  | "canManage"
  | "currentUsername"
  | "userPopoverOpen"
  | "onUserPopoverOpenChange"
  | "loadingUsers"
  | "selectedUsersLabel"
  | "users"
  | "selectedUserSet"
  | "allUsersSelected"
  | "partiallySelected"
  | "selectedUsernamesCount"
  | "onToggleSelectedUser"
  | "onSelectAllUsers"
  | "onClearSelectedUsers"
> & {
  isMobile: boolean;
};

export type CollectionDailyTargetControlsSectionProps = Pick<
  CollectionDailyFiltersCardProps,
  | "monthlyTargetInput"
  | "onMonthlyTargetInputChange"
  | "canEditTarget"
  | "savingTarget"
  | "onSaveTarget"
  | "savingCalendar"
  | "onSaveCalendar"
  | "calendarDays"
> & {
  isMobile: boolean;
};

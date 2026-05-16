import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CollectionDailyFiltersCard } from "@/pages/collection/CollectionDailyFiltersCard";

test("CollectionDailyFiltersCard renders compact desktop filter sections", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionDailyFiltersCard, {
      canManage: true,
      currentUsername: "ALPHA",
      yearInput: "2026",
      monthInput: "5",
      minYear: 2024,
      maxYear: 2030,
      onYearInputChange: () => undefined,
      onMonthInputChange: () => undefined,
      onYearCommit: () => 2026,
      onMonthCommit: () => 5,
      userPopoverOpen: false,
      onUserPopoverOpenChange: () => undefined,
      loadingUsers: false,
      selectedUsersLabel: "ALPHA",
      users: [{ id: "1", username: "ALPHA", role: "user" }],
      selectedUserSet: new Set(["alpha"]),
      allUsersSelected: true,
      partiallySelected: false,
      selectedUsernamesCount: 1,
      onToggleSelectedUser: () => undefined,
      onSelectAllUsers: () => undefined,
      onClearSelectedUsers: () => undefined,
      loadingOverview: false,
      onRefresh: () => undefined,
      monthlyTargetInput: "10000.00",
      onMonthlyTargetInputChange: () => undefined,
      canEditTarget: true,
      canEditCalendar: true,
      savingTarget: false,
      onSaveTarget: () => undefined,
      savingCalendar: false,
      onSaveCalendar: () => undefined,
      calendarDays: [],
      dirtyCalendarDaysCount: 0,
    }),
  );

  assert.match(markup, /Collection Daily/);
  assert.match(markup, /Reporting Period/);
  assert.match(markup, /Staff Scope/);
  assert.match(markup, /Refresh/);
  assert.match(markup, /rounded-2xl border border-border\/60 bg-background p-4 shadow-sm/);
});

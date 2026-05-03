import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CollectionDailyTargetControls, CollectionDailyUserFilterControl } from "@/pages/collection/CollectionDailyManagerControls";

test("CollectionDailyUserFilterControl renders a searchable solid picker", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionDailyUserFilterControl, {
      triggerId: "collection-daily-user-trigger",
      userPopoverOpen: true,
      onUserPopoverOpenChange: () => undefined,
      loadingUsers: false,
      selectedUsersLabel: "ALPHA +1",
      users: [
        { id: "1", username: "ALPHA", role: "user" },
        { id: "2", username: "BETA", role: "user" },
      ],
      selectedUserSet: new Set(["alpha"]),
      allUsersSelected: false,
      partiallySelected: true,
      selectedUsernamesCount: 1,
      onToggleSelectedUser: () => undefined,
      onSelectAllUsers: () => undefined,
      onClearSelectedUsers: () => undefined,
    }),
  );

  assert.match(markup, /aria-haspopup="dialog"/);
  assert.match(markup, /aria-expanded="true"/);
  assert.match(markup, /ALPHA \+1/);
  assert.match(markup, /bg-background text-left shadow-sm h-11 rounded-xl px-4/);
});

test("CollectionDailyTargetControls keeps target actions compact and explicit", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionDailyTargetControls, {
      monthlyTargetInput: "25000.00",
      onMonthlyTargetInputChange: () => undefined,
      canEditTarget: true,
      savingTarget: false,
      onSaveTarget: () => undefined,
      savingCalendar: false,
      onSaveCalendar: () => undefined,
      calendarDays: [],
    }),
  );

  assert.match(markup, /Monthly Target \(RM\)/);
  assert.match(markup, /Save Target/);
  assert.match(markup, /Save Calendar/);
  assert.match(markup, /border border-border\/70 bg-background p-4 shadow-sm grid rounded-2xl/);
});

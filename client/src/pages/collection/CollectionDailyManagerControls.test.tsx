import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CollectionDailyTargetControls, CollectionDailyUserFilterControl } from "@/pages/collection/CollectionDailyManagerControls";

const userFilterSource = readFileSync(
  path.resolve(process.cwd(), "client/src/pages/collection/CollectionDailyUserFilterControl.tsx"),
  "utf8",
);

test("CollectionDailyUserFilterControl renders a searchable solid picker", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionDailyUserFilterControl, {
      triggerId: "collection-daily-user-trigger",
      triggerLabelId: "collection-daily-user-label",
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
  assert.match(markup, /aria-labelledby="collection-daily-user-label collection-daily-user-trigger-value"/);
  assert.match(markup, /id="collection-daily-user-trigger-value"/);
  assert.match(markup, /ALPHA \+1/);
  assert.match(markup, /bg-background text-left shadow-sm h-11 rounded-xl px-4/);
});

test("CollectionDailyUserFilterControl spreads labelledby only when available", () => {
  assert.match(userFilterSource, /const triggerLabelledBy = triggerLabelId \? `\$\{triggerLabelId\} \$\{triggerValueId\}` : undefined;/);
  assert.match(userFilterSource, /const triggerLabelledByProps = triggerLabelledBy \? \{ "aria-labelledby": triggerLabelledBy \} : \{\};/);
  assert.match(userFilterSource, /\{\.\.\.triggerLabelledByProps\}/);
  assert.doesNotMatch(userFilterSource, /aria-labelledby=\{/);
});

test("CollectionDailyTargetControls keeps target actions compact and explicit", () => {
  const markup = renderToStaticMarkup(
    createElement(CollectionDailyTargetControls, {
      monthlyTargetInput: "25000.00",
      onMonthlyTargetInputChange: () => undefined,
      canEditTarget: true,
      canEditCalendar: true,
      savingTarget: false,
      onSaveTarget: () => undefined,
      savingCalendar: false,
      onSaveCalendar: () => undefined,
      calendarDays: [
        {
          day: 1,
          status: "WORKING",
          leaveType: null,
          note: "",
          isWorkingDay: true,
          isHoliday: false,
          holidayName: "",
        },
      ],
      dirtyCalendarDaysCount: 1,
    }),
  );

  assert.match(markup, /Monthly Target \(RM\)/);
  assert.match(markup, /Save Target/);
  assert.match(markup, /Save Changed Days/);
  assert.match(markup, /1 changed day ready to save/);
  assert.match(markup, /border border-border\/70 bg-background p-4 shadow-sm grid rounded-2xl/);
  assert.match(markup, /md:grid-cols-\[minmax\(0,220px\)_minmax\(0,1fr\)\]/);
  assert.match(markup, /max-w-full whitespace-normal text-center/);
});

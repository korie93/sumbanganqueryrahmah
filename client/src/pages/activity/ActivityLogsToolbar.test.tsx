import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ActivityLogsToolbar } from "@/pages/activity/ActivityLogsToolbar";

test("ActivityLogsToolbar renders result context and an accessible sort control", () => {
  const markup = renderToStaticMarkup(
    createElement(ActivityLogsToolbar, {
      disabled: false,
      page: 2,
      sortBy: "loginTime",
      sortOrder: "desc",
      totalItems: 37,
      totalPages: 2,
      onSortChange: () => undefined,
    }),
  );

  assert.match(markup, /37 matching records/);
  assert.match(markup, /Page 2 of 2/);
  assert.match(markup, /aria-label="Sort activity logs"/);
  assert.match(markup, /data-testid="select-activity-sort"/);
});

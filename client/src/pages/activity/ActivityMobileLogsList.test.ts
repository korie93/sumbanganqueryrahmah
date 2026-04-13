import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ActivityMobileLogsList } from "@/pages/activity/ActivityMobileLogsList";
import type { ActivityRecord } from "@/pages/activity/types";

const activity: ActivityRecord = {
  id: "activity-1",
  username: "operator.one",
  role: "admin",
  status: "ONLINE",
  ipAddress: "127.0.0.1",
  browser: "Chrome 123",
  loginTime: "2026-04-13T02:00:00.000Z",
  isActive: true,
};

test("ActivityMobileLogsList keeps moderation actions on native buttons for keyboard access", () => {
  const markup = renderToStaticMarkup(
    createElement(ActivityMobileLogsList, {
      actionLoading: null,
      activities: [activity],
      allVisibleSelected: false,
      canModerateActivity: true,
      onBanClick: () => undefined,
      onDeleteClick: () => undefined,
      onKickClick: () => undefined,
      onToggleSelected: () => undefined,
      onToggleSelectAllVisible: () => undefined,
      partiallySelected: false,
      selectedActivityIds: new Set<string>(),
    }),
  );

  assert.match(markup, /button-kick-activity-1/);
  assert.match(markup, /button-ban-activity-1/);
  assert.match(markup, /button-delete-activity-1/);
  assert.match(markup, /Force logout operator\.one/);
  assert.match(markup, /Ban operator\.one/);
  assert.match(markup, /Delete activity log for operator\.one/);
  assert.match(markup, /type="button"/);
  assert.match(markup, /<div class="box-border pb-3">/);
  assert.doesNotMatch(markup, /<div style="[^"]*" class="box-border pb-3">/);
});

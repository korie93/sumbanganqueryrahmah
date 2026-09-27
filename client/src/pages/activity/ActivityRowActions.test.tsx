import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ActivityRowActions } from "./ActivityRowActions";
import { ActivityMobileLogsList } from "./ActivityMobileLogsList";
import type { ActivityRecord } from "./types";

const activity: ActivityRecord = {
  id: "log-001", username: "operator.one", role: "admin", status: "ONLINE",
  ipAddress: "127.0.0.1", browser: "Chrome", loginTime: "2026-09-23T00:00:00Z", isActive: true,
};
const actions = { onBanClick() {}, onDeleteClick() {}, onKickClick() {}, onInvestigateClick() {} };

test("Activity row keeps two native controls in desktop and mobile layouts", () => {
  for (const mobile of [false, true]) {
    const markup = renderToStaticMarkup(createElement(ActivityRowActions, { activity, actionLoading: null, mobile, ...actions }));
    assert.equal((markup.match(/<button /g) ?? []).length, 2);
    assert.match(markup, /button-investigate-log-001/);
    assert.match(markup, /button-activity-actions-log-001/);
    assert.match(markup, /aria-haspopup="menu"/);
    assert.match(markup, /aria-label="More actions for operator.one"/);
  }
});

test("Activity pending mutation disables moderation but preserves investigation access", () => {
  const markup = renderToStaticMarkup(createElement(ActivityRowActions, { activity, actionLoading: activity.id, ...actions }));
  assert.match(markup, /disabled=""[^>]*data-testid="button-activity-actions-log-001"/);
  const investigate = markup.match(/<button[^>]*data-testid="button-investigate-log-001"[^>]*>/)?.[0];
  assert.ok(investigate);
  assert.doesNotMatch(investigate, /disabled=/);
});

test("read-only mobile users have neither selection nor moderation controls", () => {
  const markup = renderToStaticMarkup(createElement(ActivityMobileLogsList, {
    ...actions, activities: [activity], actionLoading: null, canModerateActivity: false,
    allVisibleSelected: false, partiallySelected: false, selectedActivityIds: new Set<string>(),
    onToggleSelected() {}, onToggleSelectAllVisible() {},
  }));
  assert.doesNotMatch(markup, /button-investigate-|button-activity-actions-|Select activity log/);
  const desktop = readFileSync(new URL("./ActivityDesktopLogRow.tsx", import.meta.url), "utf8");
  assert.match(desktop, /canModerateActivity \? \(\s*<div role="cell">\s*<ActivityDesktopLogActions/);
});

test("Activity menu preserves action guards, loading state and original action test ids", () => {
  const source = readFileSync(new URL("./ActivityRowActions.tsx", import.meta.url), "utf8");
  assert.match(source, /canKickActivity\(activity\) \? \(/);
  assert.match(source, /canBanActivity\(activity\) \? \(/);
  assert.equal((source.match(/disabled=\{isActionDisabled\}/g) ?? []).length, 4);
  for (const action of ["kick", "ban", "delete"]) {
    assert.ok(source.includes(`data-testid={\`button-${action}-\${activity.id}\`}`));
    assert.ok(source.includes(`openAction("${action}", on${action[0].toUpperCase()}${action.slice(1)}Click)`));
  }
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { UserAccountManagementHeader } from "./UserAccountManagementHeader";
import { UserAccountManagementNav } from "./UserAccountManagementNav";
import { UserAccountManagementOverview } from "./UserAccountManagementOverview";

test("account workspace has one concise heading and a real create launcher", () => {
  const markup = renderToStaticMarkup(createElement(UserAccountManagementHeader, { onCreate: () => undefined }));
  assert.match(markup, /<h1[^>]*>Account Management<\/h1>/);
  assert.match(markup, /Create Account/);
  assert.doesNotMatch(markup, /User Account Management|CardTitle/);
  const page = readFileSync(new URL("../UserAccountManagementSection.tsx", import.meta.url), "utf8");
  assert.match(page, /onCreate=\{\(\) => sectionState.onSelectTab\("create-closed-account"\)\}/);
  assert.doesNotMatch(page, /CardContent|lg:flex-row|buildAccountActionQueue/);
});

test("account navigation shows managed first with a semantic active state and truthful reset badge", () => {
  const markup = renderToStaticMarkup(createElement(UserAccountManagementNav, {
    activeTab: "managed-account", pendingResetCount: 2, onSelect: () => undefined,
  }));
  assert.match(markup, /aria-label="User Account Management"/);
  assert.equal((markup.match(/aria-current="page"/g) || []).length, 1);
  assert.ok(markup.indexOf("Managed Account") < markup.indexOf("Create Closed Account"));
  assert.match(markup, /Pending requests: <\/span>2/);
  assert.doesNotMatch(markup, /role="tab"|Collapse navigation|Provision new/);
  const state = readFileSync(new URL("./useUserAccountManagementSectionState.ts", import.meta.url), "utf8");
  assert.match(state, /useState<UserAccountManagementTabId>\("managed-account"\)/);
});

test("summary distinguishes directory totals from visible-page review counts without an action wall", () => {
  const markup = renderToStaticMarkup(createElement(UserAccountManagementOverview, {
    managedUserCount: 200, visibleAttentionCount: 5, pendingResetCount: 2, loading: false,
  }));
  assert.match(markup, /200 accounts/);
  assert.match(markup, /5 on this page need access review/);
  assert.match(markup, /2 reset requests/);
  assert.doesNotMatch(markup, /Action queue|Approve or reject|Live workspace|<h3/);
});

test("loading account summary does not present transient zero totals as loaded facts", () => {
  const markup = renderToStaticMarkup(createElement(UserAccountManagementOverview, {
    managedUserCount: 0, visibleAttentionCount: 0, pendingResetCount: 0, loading: true,
  }));
  assert.match(markup, /role="status">Loading account summary/);
  assert.doesNotMatch(markup, /0 accounts|0 reset requests/);
});

import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GroupListPanel } from "./GroupListPanel";

test("each group disclosure names its visible leader and preserves expanded/controls state", () => {
  const html = renderToStaticMarkup(createElement(GroupListPanel, {
    loadingGroups: false, selectedGroupId: "", groupSearch: "", expandedGroupIds: ["first"],
    filteredGroups: ["Amina", "Wei Lin"].map((leaderNickname, index) => ({
      id: index ? "second" : "first", leaderNickname, leaderNicknameId: null,
      leaderIsActive: true, leaderRoleScope: "admin", memberNicknames: [], memberNicknameIds: [],
      createdBy: null, createdAt: "2026-11-04", updatedAt: "2026-11-04",
    })),
    onGroupSearchChange() {}, onToggleExpandGroup() {}, onSelectGroup() {}, onUngroup() {},
    nicknameIdByName: new Map(),
  }));
  assert.match(html, /aria-expanded="true" aria-controls="group-members-first" aria-label="Collapse group members: Amina"/);
  assert.match(html, /aria-expanded="false" aria-controls="group-members-second" aria-label="Expand group members: Wei Lin"/);
  assert.match(html, /id="group-members-first"/);
});

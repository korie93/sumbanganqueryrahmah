import assert from "node:assert/strict";
import test from "node:test";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { NicknameAssignmentTable } from "./NicknameAssignmentTable";

function render(extra: Partial<ComponentProps<typeof NicknameAssignmentTable>> = {}) {
  return renderToStaticMarkup(createElement(NicknameAssignmentTable, {
    selectedGroup: null, selectedGroupId: "", loadingNicknames: false, filteredNicknames: [], assignedIds: [],
    statusBusyId: null, resettingNicknameId: null, deletingNicknameId: null,
    onToggleAssigned() {}, onEditNickname() {}, onDeactivateNickname() {}, onActivateNickname() {}, onResetNicknamePassword() {}, onDeleteNickname() {},
    ...extra,
  }));
}

test("a filtered no-match result explains the query and offers a clear action", () => {
  const html = render({ nicknameSearch: "<nonmatch>", totalNicknameCount: 3, onClearSearch() {} });
  assert.match(html, /Tiada nickname sepadan dengan carian ini/);
  assert.match(html, /Kosongkan carian/);
  assert.doesNotMatch(html, /Belum ada nickname|<nonmatch>/);
});

test("a genuinely empty source and pending load do not pretend that a filter removed results", () => {
  const html = render({ totalNicknameCount: 0 });
  assert.match(html, /Belum ada nickname untuk dipaparkan/);
  assert.doesNotMatch(html, /Kosongkan carian/);
  const loading = render({ loadingNicknames: true, nicknameSearch: "test", totalNicknameCount: 3 });
  assert.match(loading, /Loading nickname data/);
  assert.doesNotMatch(loading, /Tiada nickname sepadan|Belum ada nickname/);
});

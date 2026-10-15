import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import test from "node:test";
import { NicknameAssignmentHeader, type NicknameAssignmentHeaderProps } from "./NicknameAssignmentHeader";
import { NicknameAssignmentTable, type NicknameAssignmentTableProps } from "./NicknameAssignmentTable";

const noop = () => undefined;
const header: NicknameAssignmentHeaderProps = {
  selectedGroup: null, selectedGroupId: "", assignedActive: 0, activeAvailable: 1,
  unsaved: false, nicknameSearch: "", savingAssignment: false,
  onNicknameSearchChange: noop, onOpenCreateGroup: noop, onOpenChangeLeader: noop,
  onDeleteSelectedGroup: noop, onOpenAddNickname: noop, onSelectAll: noop,
  onClearAll: noop, onSaveAssignment: noop,
};
const table: NicknameAssignmentTableProps = {
  selectedGroup: null, selectedGroupId: "", loadingNicknames: false,
  filteredNicknames: [{id: "nick-1", nickname: "Demo Collector", isActive: true,
    roleScope: "both", createdBy: "demo", createdAt: "2026-10-15T00:00:00Z"}],
  assignedIds: [], statusBusyId: null, resettingNicknameId: null, deletingNicknameId: null,
  onToggleAssigned: noop, onEditNickname: noop, onDeactivateNickname: noop,
  onActivateNickname: noop, onResetNicknamePassword: noop, onDeleteNickname: noop,
};

test("nickname search has a persistent visible label and preserves save guards", () => {
  const markup = renderToStaticMarkup(createElement(NicknameAssignmentHeader, header));
  assert.match(markup, /for="nickname-assignment-search"[^>]*>Cari nickname/);
  assert.match(markup, /<input[^>]*id="nickname-assignment-search"/);
  assert.match(markup, /<button[^>]*disabled=""[^>]*>Save Assignment<\/button>/);
  assert.match(markup, /2\. Pilih nickname/);
});

test("desktop assignment has named checkbox and one scoped additional-actions trigger", () => {
  const markup = renderToStaticMarkup(createElement(NicknameAssignmentTable, table));
  assert.match(markup, /aria-label="Nickname assignments"/);
  assert.match(markup, /aria-label="Assign Demo Collector"/);
  assert.match(markup, /aria-label="More actions for Demo Collector"/);
  assert.match(markup, /aria-haspopup="menu"/);
  assert.doesNotMatch(markup, />Reset Password<|>Delete</);
});

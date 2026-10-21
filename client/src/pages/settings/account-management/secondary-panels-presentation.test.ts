import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CreateClosedAccountSection } from "./CreateClosedAccountSection";
import { CreateAccountDashboardNickname } from "./CreateAccountDashboardNickname";
import { LocalMailOutboxDesktopTable } from "./LocalMailOutboxDesktopTable";
import { LocalMailOutboxFiltersPanel } from "./LocalMailOutboxFiltersPanel";
import { PendingPasswordResetDesktopTable } from "./PendingPasswordResetDesktopTable";
import { PendingPasswordResetFiltersPanel } from "./PendingPasswordResetFiltersPanel";
import type { DevMailOutboxPreview, PendingPasswordResetRequest } from "../types";

const noop = () => undefined;
const emptyState = { title: "No results", description: "Try another search." };

test("create-account Dashboard nickname is optional, folded on first render and unnecessary for manager", () => {
  const markup = renderToStaticMarkup(createElement(CreateAccountDashboardNickname, {
    role: "user", selectedId: "", disabled: false, onChange: noop,
  }));
  assert.match(markup, /Kutipan Dashboard/);
  assert.match(markup, /\(pilihan\)/);
  assert.match(markup, /aria-expanded="false"/);
  assert.match(markup, /Tetapkan nickname sekarang/);
  assert.doesNotMatch(markup, /<select/);
  const manager = renderToStaticMarkup(createElement(CreateAccountDashboardNickname, {
    role: "manager", selectedId: "", disabled: false, onChange: noop,
  }));
  assert.match(manager, /nickname tidak diperlukan/);
  assert.doesNotMatch(manager, /<select|<button/);
});

test("create account keeps labeled production fields, inline errors and native submit without a password field", () => {
  const markup = renderToStaticMarkup(createElement(CreateClosedAccountSection, {
    createEmailInput: "",
    createFieldErrors: { createEmailInput: "Activation email is required." },
    createFullNameInput: "",
    createRoleInput: "admin",
    createUsernameInput: "operator",
    creatingManagedUser: false,
    onCreateEmailInputChange: noop,
    onCreateFieldBlur: noop,
    onCreateFullNameInputChange: noop,
    onCreateManagedUser: noop,
    onCreateRoleInputChange: noop,
    onCreateUsernameInputChange: noop,
  }));
  for (const field of ["full-name", "username", "email", "role"]) {
    assert.match(markup, new RegExp(`for="create-closed-account-${field}"`));
    assert.match(markup, new RegExp(`id="create-closed-account-${field}"`));
  }
  assert.match(markup, /<form[^>]*novalidate=""/);
  assert.match(markup, /type="submit"/);
  assert.match(markup, /aria-invalid="true"/);
  assert.match(markup, /id="create-closed-account-email-error"[^>]*role="alert"/);
  assert.match(markup, /Administrative access/);
  assert.doesNotMatch(markup, /type="password"/);
});

test("secondary search inputs remain outside collapsed accessible filters", () => {
  const pending = renderToStaticMarkup(createElement(PendingPasswordResetFiltersPanel, {
    activeFilters: [], hasActiveFilters: false, searchQuery: "", statusFilter: "all",
    onClearAll: noop, onSearchQueryChange: noop, onStatusChange: noop,
  }));
  assert.match(pending, /for="pending-reset-search-query"/);
  assert.match(pending, /id="pending-reset-search-query"/);
  assert.match(pending, /aria-expanded="false" aria-controls="pending-reset-filters"/);
  assert.doesNotMatch(pending, /<select/);

  const outbox = renderToStaticMarkup(createElement(LocalMailOutboxFiltersPanel, {
    activeFilters: [], emailQuery: "", hasActiveFilters: false, sortDirection: "desc", subjectQuery: "",
    onClearAll: noop, onEmailQueryChange: noop, onSortDirectionChange: noop, onSubjectQueryChange: noop,
  }));
  assert.match(outbox, /for="local-mail-outbox-email-query"/);
  assert.match(outbox, /id="local-mail-outbox-email-query"/);
  assert.match(outbox, /aria-expanded="false" aria-controls="local-mail-outbox-filters"/);
  assert.doesNotMatch(outbox, /<select/);
});

test("pending reset remains review-only and secondary tables delegate scrolling to one outer region", () => {
  const markup = renderToStaticMarkup(createElement(PendingPasswordResetDesktopTable, {
    emptyState, loading: false, requests: [{
      id: "request-1", username: "operator", fullName: "Operator", email: "operator@example.test",
      requestedByUser: "operator", status: "active", isBanned: false, createdAt: "2026-10-01T00:00:00Z",
    } as PendingPasswordResetRequest],
  }));
  assert.equal((markup.match(/scope="col"/g) || []).length, 4);
  assert.match(markup, /tabindex="-1" class="[^"]*overflow-visible/);
  assert.doesNotMatch(markup, /<button/);

  for (const file of ["PendingPasswordResetSection.tsx", "LocalMailOutboxSection.tsx"]) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    assert.doesNotMatch(source, /SideTabDataPanel/);
    assert.match(source, /role="region"[^>]*tabIndex=\{0\}/);
    assert.match(source, /focus-visible:ring-inset/);
    assert.match(source, /scrollbar-gutter:stable/);
  }
});

test("outbox retains open/copy/delete actions and pending-deletion guard", () => {
  const markup = renderToStaticMarkup(createElement(LocalMailOutboxDesktopTable, {
    clearingDevMailOutbox: false, deletingDevMailOutboxId: "mail-1", emptyState, loading: false,
    entries: [{ id: "mail-1", to: "operator@example.test", subject: "Activation", createdAt: "2026-10-01T00:00:00Z", previewUrl: "/preview/mail-1" } as DevMailOutboxPreview],
    onCopyPreviewLink: async () => undefined, onOpenDeleteDialog: noop, onOpenPreviewDialog: noop,
  }));
  assert.match(markup, />Open<\/button>/);
  assert.match(markup, />Copy Link<\/button>/);
  assert.match(markup, /<button[^>]*disabled=""[^>]*>Deleting\.\.\.<\/button>/);
  assert.equal((markup.match(/scope="col"/g) || []).length, 4);
});

test("details keeps real action guards and modal transition focus handling; edit footer stays outside scroll body", () => {
  const detail = readFileSync(new URL("ManagedAccountDetailSheet.tsx", import.meta.url), "utf8");
  assert.match(detail, /<ManagedAccountLoginAccess user=\{user\}/);
  assert.match(detail, /onOpenAutoFocus=/);
  assert.match(detail, /onCloseAutoFocus=/);
  assert.match(detail, /!actionTransitionRef\.current && returnFocusRef\.current\?\.isConnected/);
  assert.match(detail, /user\.status !== "pending_activation" \|\| Boolean\(user\.isBanned\)/);
  assert.match(detail, /deletingManagedUserId === user\.id/);
  for (const callback of ["onEditUser", "onResetPassword", "onResendActivation", "onBanToggle", "onRequestDelete"]) {
    assert.match(detail, new RegExp(`runDetailAction\\(${callback}`));
  }
  const edit = readFileSync(new URL("../ManagedUserDialog.tsx", import.meta.url), "utf8");
  assert.match(edit, /min-h-0[^"\n]*overflow-y-auto/);
  assert.match(edit, /<\/div>\s*<DialogFooter className="shrink-0/);
  assert.match(edit, /onClick=\{onConfirmManagedSave\}/);
  assert.match(edit, /onManagedIsBannedChange\(event\.target\.value === "true"\)/);
  assert.match(edit, /await onSaveCriticalSettings\(\)/);
});
